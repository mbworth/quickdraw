#!/usr/bin/env node
// Open-loop replay: a recorded game is the fixed environment (states, triggers, last orders, timing); one arm of the harness
// re-decides every recorded decision and its orders are scored against the recording. The world does not react to the new
// orders, so this measures decisions, not outcomes. ~$0.006 a decision; --every k samples every kth decision.
// node bin/trajectory.mjs <run.jsonl> [--every 1] [--from N] [--to N] [--out arm.json] [--model M] [--prompt file]
//                         [--slim | --full-every N] [--packet-max n] [--thinking …] [--effort …] [--<game>-* …] [--dry]
// node bin/trajectory.mjs --compare a.json b.json …
// node bin/trajectory.mjs --rescore a.json … : re-score stored orders against the current rules (free).
// Rules: test/games/<game>/bench/rules.mjs, per decision {id, when(state, sent, dropped), pass(sent, dropped, state)}; the arm and the
// recording are both scored, so the recording is the reference column.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, sha, boot, modelFor, redact } from './_boot.mjs';
import { loadAdapterModule, parseArgs } from '../src/core/args.mjs';
import { realClock } from '../src/core/clock.mjs';
import { assemble } from '../src/core/packet.mjs';
import { applyOrders } from '../src/core/pilot.mjs';
import { answered } from '../src/core/model.mjs';
import { readRun } from '../src/core/record.mjs';
import { pctl } from './pace.mjs';

const BOOL = ['dry', 'slim', 'stream', 'diff'];
const snapOf = (rows, ref) => { const r = rows[ref - 1]; if (!r || r.kind !== 'state') throw new Error(`ref ${ref} is not a state line`); return { header: r.header, native: r.native, t: r.st, idx: r.idx }; };
const kinds = cmds => cmds.map(c => c.cmd).sort().join(',');

export async function loadRules(game) {
  const f = path.join(ROOT, `test/games/${game}/bench/rules.mjs`);
  return fs.existsSync(f) ? (await import(f)).rules : [];
}

// scoreRules(rows, stateOf, rules) → {arm:{id:{applies, pass}}, recorded:{…}}; stateOf(n) is the decision's native state.
export function scoreRules(rows, stateOf, rules) {
  const tally = pick => { const out = {}; for (const r of rules) out[r.id] = { applies: 0, pass: 0 }; for (const row of rows) { const s = stateOf(row.n); if (!s) continue; const { sent, dropped } = pick(row); for (const r of rules) if (r.when(s, sent, dropped)) { out[r.id].applies++; if (r.pass(sent, dropped, s)) out[r.id].pass++; } } return out; };
  return { arm: tally(r => ({ sent: answered(r.stop) ? r.sent : [], dropped: r.dropped })), recorded: tally(r => ({ sent: r.recorded, dropped: r.recordedDropped || [] })) };
}
export const stateOfRun = rows => { const calls = new Map(rows.filter(r => r.kind === 'call').map(c => [c.n, c])); return n => { const c = calls.get(n); const s = c && rows[c.stateRef - 1]; return s?.kind === 'state' ? s.native : null; }; };

// replayTrajectory({rows, adapter, callModel, flags, divisor, clock, every, from, to, log}) → rows [{n, gt, est, out, latencyMs, cost, stop, recorded, sent, dropped, same}]
export async function replayTrajectory({ rows, adapter, callModel, flags = {}, divisor, clock, every = 1, from = 1, to = Infinity, log = () => {} }) {
  const cfg = rows[0];
  const calls = rows.filter(r => r.kind === 'call' && r.packet != null && r.n >= from && r.n <= to && (r.n - from) % every === 0);
  const decisions = new Map(rows.filter(r => r.kind === 'decision').map(d => [d.n, d]));
  const out = [];
  for (const call of calls) {
    const state = snapOf(rows, call.stateRef), prev = call.prevDecisionRef ? snapOf(rows, call.prevDecisionRef) : null;
    const layers = adapter.encode({ state, prevDecisionState: prev, triggers: call.triggers, lastOrders: call.lastOrders, pending: call.pending || [] });
    const pkt = assemble(layers, { maxTokens: flags.packetMax ?? cfg.packetMax ?? 600, divisor, fullEvery: flags.slim ? 5 : (flags.fullEvery ?? cfg.fullEvery ?? 0), n: call.n });
    const res = await callModel({ packet: pkt.text });
    const { keep, dropped } = applyOrders({ adapter, orders: res.act ? res.orders : [], state, decidedOn: state, staleAfterMs: cfg.staleAfter, clock });   // the pilot's own pipeline (stale check included), so the arm is scored like the recording
    const recorded = decisions.get(call.n)?.sent || [];
    const row = { n: call.n, gt: state.header?.clocks?.game ?? null, est: pkt.estTokens, out: res.usage?.output_tokens ?? null, latencyMs: res.latencyMs, cost: res.cost || 0, stop: res.stop, recorded, recordedDropped: decisions.get(call.n)?.dropped || [], sent: keep, dropped, same: kinds(keep) === kinds(recorded) };
    if (res.note != null) { row.o = res.raw?.o ?? null; row.why = res.note; row.agree = agreement(res.orders, recorded); if (flags.diff && !(row.agree.buy && row.agree.army)) row.packet = pkt.text; }   // a script arm: what it said and whether the recording agrees
    out.push(row);
    log(`n=${call.n} ${row.same ? 'same' : 'DIFF'} ${res.latencyMs} ms out=${row.out ?? '-'} rec[${kinds(recorded)}] new[${kinds(keep)}]${row.agree ? ` buy ${row.agree.buy ? 'y' : 'n'} army ${row.agree.army ? 'y' : 'n'}` : ''}`);
  }
  return out;
}

// agreement(script, recorded) → {buy, army}: does the recording carry the script's purchase (same cmd and type, same building for a train)
// and its army order (same target for an attack, a move within 8 of the same point)? A script that ordered nothing agrees with a recording
// that ordered nothing of that kind. Orders are compared after the script's decode and the recording's expand: cmd, type, building, x/z
// and target survive both.
const BUY = new Set(['train', 'build']), ARMY = new Set(['move', 'attack']);
export function agreement(script, recorded) {
  const sb = script.find(c => BUY.has(c.cmd)), sa = script.find(c => ARMY.has(c.cmd));
  const buy = sb ? recorded.some(r => r.cmd === sb.cmd && r.type === sb.type && (sb.cmd !== 'train' || r.building === sb.building)) : !recorded.some(r => BUY.has(r.cmd));
  const army = sa ? recorded.some(r => r.cmd === sa.cmd && (sa.cmd === 'attack' ? r.target === sa.target : Math.hypot(r.x - sa.x, r.z - sa.z) <= 8)) : !recorded.some(r => ARMY.has(r.cmd));
  return { buy, army };
}
const brief = cmds => cmds.map(c => [c.cmd, c.type, c.building, c.units?.length, c.x != null ? `${c.x},${c.z}` : null, c.target].filter(v => v != null && v !== '').join(' ')).join('; ') || '-';
export function diff(rows) {
  return rows.filter(r => r.agree && !(r.agree.buy && r.agree.army)).map(r => `n=${r.n} t=${r.gt} ${r.agree.buy ? '' : 'BUY '}${r.agree.army ? '' : 'ARMY '}[${r.why}]\n  script:   ${r.o}\n  recorded: ${brief(r.recorded)}${r.packet ? '\n' + r.packet.split('\n').map(l => '  | ' + l).join('\n') : ''}`).join('\n');
}

// Game-agnostic scores over one arm's rows. Per-game rule checks live in the bench; here: agreement with the recording,
// orders per decision, no-ops, drops, tokens, latency.
export function summarize(rows) {
  const ok = rows.filter(r => answered(r.stop));
  const drops = {}; for (const r of rows) for (const d of r.dropped) drops[d.reason] = (drops[d.reason] || 0) + 1;
  return {
    decisions: rows.length, failed: rows.length - ok.length,
    sameKinds: rows.length ? Math.round((100 * rows.filter(r => r.same).length) / rows.length) : null,
    noopPct: ok.length ? Math.round((100 * ok.filter(r => !r.sent.length).length) / ok.length) : null,
    recordedNoopPct: rows.length ? Math.round((100 * rows.filter(r => !r.recorded.length).length) / rows.length) : null,
    ordersPerDecision: ok.length ? Math.round((10 * ok.reduce((a, r) => a + r.sent.length, 0)) / ok.length) / 10 : null,
    recordedOrdersPerDecision: rows.length ? Math.round((10 * rows.reduce((a, r) => a + r.recorded.length, 0)) / rows.length) / 10 : null,
    drops, estP50: pctl(rows.map(r => r.est), 0.5), outP50: pctl(ok.map(r => r.out).filter(x => x != null), 0.5), latencyP50: pctl(ok.map(r => r.latencyMs), 0.5),
    cost: Math.round(rows.reduce((a, r) => a + r.cost, 0) * 1e4) / 1e4,
    ...agreeRates(rows),
  };
}

const agreeRates = rows => {
  const ag = rows.filter(r => r.agree);
  if (!ag.length) return {};
  const pc = f => Math.round((100 * ag.filter(f).length) / ag.length);
  return { buyAgree: pc(r => r.agree.buy), armyAgree: pc(r => r.agree.army), bothAgree: pc(r => r.agree.buy && r.agree.army) };
};

function compare(files) {
  const arms = files.map(f => ({ name: path.basename(f, '.json'), ...JSON.parse(fs.readFileSync(f, 'utf8')) }));
  const keys = ['decisions', 'failed', 'sameKinds', 'buyAgree', 'armyAgree', 'bothAgree', 'noopPct', 'recordedNoopPct', 'ordersPerDecision', 'recordedOrdersPerDecision', 'estP50', 'outP50', 'latencyP50', 'cost'];
  console.log(['metric'.padEnd(26), ...arms.map(a => a.name.slice(0, 14).padStart(14))].join(''));
  for (const k of keys) console.log([k.padEnd(26), ...arms.map(a => String(a.summary[k]).padStart(14))].join(''));
  const reasons = [...new Set(arms.flatMap(a => Object.keys(a.summary.drops)))];
  for (const r of reasons) console.log([('drop:' + r).padEnd(26), ...arms.map(a => String(a.summary.drops[r] || 0).padStart(14))].join(''));
  const ruleIds = [...new Set(arms.flatMap(a => Object.keys(a.rules?.arm || {})))];
  if (ruleIds.length) {
    const cell = t => (t ? `${t.pass}/${t.applies}` : '-');
    console.log(['rule (pass/applies)'.padEnd(26), ...arms.map(a => a.name.slice(0, 14).padStart(14)), '      recorded'].join(''));
    for (const id of ruleIds) console.log([('rule:' + id).padEnd(26), ...arms.map(a => cell(a.rules.arm[id]).padStart(14)), cell(arms[0].rules.recorded[id]).padStart(14)].join(''));
  }
}

async function rescore(files) {
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const runFile = d.arm.runPath || path.join(ROOT, 'runs', d.arm.run);
    const rows = readRun(runFile);
    const rules = await loadRules(rows[0].game);
    d.rules = scoreRules(d.rows, stateOfRun(rows), rules);
    fs.writeFileSync(f, JSON.stringify(d, null, 1));
    console.error(`${path.basename(f)}: ${Object.entries(d.rules.arm).map(([k, v]) => `${k} ${v.pass}/${v.applies}`).join('  ')}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--compare') { compare(argv.slice(1)); process.exit(0); }
  if (argv[0] === '--rescore') { await rescore(argv.slice(1)); process.exit(0); }
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) { console.error('usage: trajectory <run.jsonl> [--every k] [--out file] [--model script:<name> [--diff]] [arm flags…] | --compare a.json b.json…'); process.exit(64); }
  const rest = argv.filter(a => a !== file);
  const pre = await boot(rest, { booleans: BOOL });
  const rows = readRun(file);
  const cfg = rows[0];
  if (cfg.kind !== 'config') { console.error('line 1 is not the config'); process.exit(65); }
  const game = pre.flags.game || cfg.game;
  const { flags, gameOpts } = parseArgs(rest, { booleans: BOOL, game });
  const model = flags.model || cfg.model;
  const system = flags.prompt ? fs.readFileSync(flags.prompt, 'utf8') : cfg.system ?? (cfg.prompt ? fs.readFileSync(path.join(ROOT, cfg.prompt), 'utf8') : '');
  const clock = realClock();
  const mod = await loadAdapterModule(game);
  const opts = { ...(cfg.gameOpts || {}), ...gameOpts };   // the arm's game options override the recording's
  const adapter = mod.createAdapter(process.env, { ...opts, clock, open: true, host: 'ws://127.0.0.1:1' });
  const callModel = flags.dry
    ? async () => ({ act: false, orders: [], note: null, usage: null, stop: 'dry', latencyMs: 0, cost: 0 })
    : await modelFor({ adapter, game, model, system, thinking: flags.thinking ?? cfg.thinking, effort: flags.effort ?? cfg.effort, reply: flags.reply ?? cfg.reply, stream: flags.stream ?? cfg.stream, decisionDeadlineMs: flags.decisionDeadline ?? 20000, clock });
  const arm = { run: path.basename(file), runPath: path.resolve(file), model, prompt: sha(system).slice(0, 12), schema: sha(JSON.stringify(adapter.tool)).slice(0, 12), flags: redact(flags), gameOpts: redact(opts) };
  console.error(`trajectory ${arm.run} every ${flags.every ?? 1}, prompt ${arm.prompt} schema ${arm.schema} ${flags.slim ? 'slim' : `full-every ${flags.fullEvery ?? cfg.fullEvery ?? 0}`} ${Object.keys(opts).join(',')}`);
  const out = await replayTrajectory({ rows, adapter, callModel, flags, divisor: mod.divisor ?? cfg.divisor ?? 3.5, clock, every: flags.every ?? 1, from: flags.from ?? 1, to: flags.to ?? Infinity, log: m => console.error(m) });
  const summary = summarize(out);
  const rules = scoreRules(out, stateOfRun(rows), await loadRules(game));
  console.log(JSON.stringify({ ...summary, rules: rules.arm }));
  if (flags.diff) console.log(diff(out));
  if (flags.out) fs.writeFileSync(flags.out, JSON.stringify({ arm, summary, rules, rows: out }, null, 1));
}

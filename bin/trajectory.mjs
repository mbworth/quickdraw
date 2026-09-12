#!/usr/bin/env node
// Open-loop replay: a recorded game is the fixed environment (states, triggers, last orders, timing); one arm of the harness
// re-decides every recorded decision and its orders are scored against the recording. The world does not react to the new
// orders, so this measures decisions, not outcomes. ~$0.006 a decision; --every k samples every kth decision.
// node bin/trajectory.mjs <run.jsonl> [--every 1] [--from N] [--to N] [--out arm.json] [--model M] [--prompt file]
//                         [--slim | --full-every N] [--packet-max n] [--thinking …] [--effort …] [--<game>-* …] [--dry]
// node bin/trajectory.mjs --compare a.json b.json …
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, sha, boot, modelFor, redact } from './_boot.mjs';
import { loadAdapterModule, parseArgs } from '../src/core/args.mjs';
import { realClock } from '../src/core/clock.mjs';
import { assemble } from '../src/core/packet.mjs';
import { applyOrders } from '../src/core/pilot.mjs';
import { readRun } from '../src/core/record.mjs';
import { pctl } from './pace.mjs';

const BOOL = ['dry', 'slim'];
const snapOf = (rows, ref) => { const r = rows[ref - 1]; if (!r || r.kind !== 'state') throw new Error(`ref ${ref} is not a state line`); return { header: r.header, native: r.native, t: r.st, idx: r.idx }; };
const kinds = cmds => cmds.map(c => c.cmd).sort().join(',');

// replayTrajectory({rows, adapter, callModel, flags, divisor, clock, every, from, to, log}) → rows [{n, gt, est, out, latencyMs, cost, stop, recorded, sent, dropped, same}]
export async function replayTrajectory({ rows, adapter, callModel, flags = {}, divisor, clock, every = 1, from = 1, to = Infinity, log = () => {} }) {
  const cfg = rows[0];
  const calls = rows.filter(r => r.kind === 'call' && r.packet != null && r.n >= from && r.n <= to && (r.n - from) % every === 0);
  const decisions = new Map(rows.filter(r => r.kind === 'decision').map(d => [d.n, d]));
  const out = [];
  for (const call of calls) {
    const state = snapOf(rows, call.stateRef), prev = call.prevDecisionRef ? snapOf(rows, call.prevDecisionRef) : null;
    const layers = adapter.encode({ state, prevDecisionState: prev, triggers: call.triggers, lastOrders: call.lastOrders });
    const pkt = assemble(layers, { maxTokens: flags.packetMax ?? cfg.packetMax ?? 600, divisor, fullEvery: flags.slim ? 5 : (flags.fullEvery ?? cfg.fullEvery ?? 0), n: call.n });
    const res = await callModel({ packet: pkt.text });
    const { keep, dropped } = applyOrders({ adapter, orders: res.act ? res.orders : [], state, clock });
    const recorded = decisions.get(call.n)?.sent || [];
    const row = { n: call.n, gt: state.header?.clocks?.game ?? null, est: pkt.estTokens, out: res.usage?.output_tokens ?? null, latencyMs: res.latencyMs, cost: res.cost || 0, stop: res.stop, recorded, sent: keep, dropped, same: kinds(keep) === kinds(recorded) };
    out.push(row);
    log(`n=${call.n} ${row.same ? 'same' : 'DIFF'} ${res.latencyMs} ms out=${row.out ?? '-'} rec[${kinds(recorded)}] new[${kinds(keep)}]`);
  }
  return out;
}

// Game-agnostic scores over one arm's rows. Per-game rule checks live in the bench; here: agreement with the recording,
// orders per decision, no-ops, drops, tokens, latency.
export function summarize(rows) {
  const ok = rows.filter(r => r.stop === 'tool_use');
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
  };
}

function compare(files) {
  const arms = files.map(f => ({ name: path.basename(f, '.json'), ...JSON.parse(fs.readFileSync(f, 'utf8')) }));
  const keys = ['decisions', 'failed', 'sameKinds', 'noopPct', 'recordedNoopPct', 'ordersPerDecision', 'recordedOrdersPerDecision', 'estP50', 'outP50', 'latencyP50', 'cost'];
  console.log(['metric'.padEnd(26), ...arms.map(a => a.name.slice(0, 14).padStart(14))].join(''));
  for (const k of keys) console.log([k.padEnd(26), ...arms.map(a => String(a.summary[k]).padStart(14))].join(''));
  const reasons = [...new Set(arms.flatMap(a => Object.keys(a.summary.drops)))];
  for (const r of reasons) console.log([('drop:' + r).padEnd(26), ...arms.map(a => String(a.summary.drops[r] || 0).padStart(14))].join(''));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--compare') { compare(argv.slice(1)); process.exit(0); }
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) { console.error('usage: trajectory <run.jsonl> [--every k] [--out file] [arm flags…] | --compare a.json b.json…'); process.exit(64); }
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
    : await modelFor({ adapter, model, system, thinking: flags.thinking ?? cfg.thinking, effort: flags.effort ?? cfg.effort, decisionDeadlineMs: flags.decisionDeadline ?? 20000, clock });
  const arm = { run: path.basename(file), model, prompt: sha(system).slice(0, 12), schema: sha(JSON.stringify(adapter.tool)).slice(0, 12), flags: redact(flags), gameOpts: redact(opts) };
  console.error(`trajectory ${arm.run} every ${flags.every ?? 1}, prompt ${arm.prompt} schema ${arm.schema} ${flags.slim ? 'slim' : `full-every ${flags.fullEvery ?? cfg.fullEvery ?? 0}`} ${Object.keys(opts).join(',')}`);
  const out = await replayTrajectory({ rows, adapter, callModel, flags, divisor: mod.divisor ?? cfg.divisor ?? 3.5, clock, every: flags.every ?? 1, from: flags.from ?? 1, to: flags.to ?? Infinity, log: m => console.error(m) });
  const summary = summarize(out);
  console.log(JSON.stringify(summary));
  if (flags.out) fs.writeFileSync(flags.out, JSON.stringify({ arm, summary, rows: out }, null, 1));
}

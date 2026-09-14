#!/usr/bin/env node
// Decision bench: fixed states with the order the prompt calls for, scored over repeats. ~$0.006 a call against ~$0.70 a game.
// node bin/bench.mjs --model claude-sonnet-5 --prompt prompts/ashfall/game15-sonnet.md [--repeats 5] [--pick push,turret] [--out arm.json]
//                    [--slim] [--full-every N] [--packet-max 600] [--thinking adaptive|off] [--effort low] [--reply tool|text] [--drop-layer name] [--<game>-* …] [--dry]
// node bin/bench.mjs --compare a.json b.json … : pass rates side by side.
// node bin/bench.mjs --rescore a.json … : re-score stored orders against the current cases.mjs (free; predicates change, calls need not).
// Each case is one call with no history (lastOrders none, the fixture's events or a heartbeat as triggers).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, sha, boot, modelFor, redact, isScript } from './_boot.mjs';
import { loadAdapterModule, parseArgs } from '../src/core/args.mjs';
import { realClock } from '../src/core/clock.mjs';
import { assemble } from '../src/core/packet.mjs';
import { applyOrders } from '../src/core/pilot.mjs';
import { answered } from '../src/core/model.mjs';
import { rankAndCollapse } from '../src/core/digest.mjs';
import { pctl } from './pace.mjs';

const BOOL = ['dry', 'slim', 'stream'];

export async function loadCases(game, pick = null) {
  const dir = path.join(ROOT, `test/games/${game}/bench`);
  const { cases } = await import(path.join(dir, 'cases.mjs'));
  const want = pick ? new Set(String(pick).split(',')) : null;
  return cases.filter(c => !want || want.has(c.id)).map(c => ({ ...c, fx: JSON.parse(fs.readFileSync(path.resolve(dir, c.fixture), 'utf8')) }));
}

// runBench({adapter, callModel, cases, repeats, toTrigger, flags, divisor, clock}) → rows [{id, rep, pass, est, out, latencyMs, cost, sent, dropped:[{cmd, reason}]}]
const victimLines = layer => new Set([layer.text, ...(layer.lines || []).map(l => l.text)].filter(Boolean));

export async function runBench({ adapter, callModel, cases, repeats, toTrigger, flags, divisor, clock, log = () => {} }) {
  const snap = fx => ({ header: { lifecycle: 'active', phaseNative: 'running', clocks: { game: fx.state.time }, gameId: '1', seat: 'team0' }, native: fx.state, t: 0, idx: 1 });
  const rows = [];
  for (let rep = 1; rep <= repeats; rep++) {
    for (const c of cases) {
      const state = snap(c.fx);
      const triggers = rankAndCollapse((c.fx.events || []).map(ev => ({ ...toTrigger(ev, c.fx.state.team), t: 0 })), { classes: adapter.meta.classes });
      if (!triggers.length) triggers.push({ cls: 'heartbeat', key: 'hb', t: 0 });
      const all = adapter.encode({ state, prevDecisionState: null, triggers, lastOrders: [] });
      // flags.dropLayer (sensitivity.mjs): the packet without that layer. Skipped when the control packet would not carry it anyway
      // (slim cadence, budget) or it renders as `X none`: nothing to remove, not worth a call.
      const asm = { maxTokens: flags.packetMax ?? 600, divisor, fullEvery: flags.slim ? 5 : (flags.fullEvery ?? 0), n: flags.slim ? 2 : 1 };
      const victim = flags.dropLayer ? all.find(l => l.name === flags.dropLayer) : null;
      const absent = flags.dropLayer && (!victim || (!victim.lines?.length && /\snone$/.test(victim.text)) || !assemble(all, asm).kept.some(k => k.name === victim.name));
      if (absent) { rows.push({ id: c.id, rep, skipped: 'absent', pass: null, stop: 'skipped', est: null, out: null, latencyMs: 0, cost: 0, sent: [], dropped: [] }); continue; }
      // The victim comes out after assembly, so its budget is not refilled by layers the control had dropped: Δ is "without X", nothing else.
      const full = assemble(all, asm);
      const pkt = victim ? { ...full, text: full.text.split('\n').filter(l => !victimLines(victim).has(l)).join('\n') } : full;
      const res = await callModel({ packet: pkt.text });
      const { keep, dropped } = applyOrders({ adapter, orders: res.act ? res.orders : [], state, clock });
      const pass = answered(res.stop) && !!c.expect(keep, c.fx.state);
      rows.push({ id: c.id, rep, pass, stop: res.stop, est: pkt.estTokens, out: res.usage?.output_tokens ?? null, latencyMs: res.latencyMs, cost: res.cost || 0, sent: keep, dropped });
      log(`${c.id.padEnd(8)} rep ${rep} ${pass ? 'PASS' : 'fail'} ${res.latencyMs} ms out=${res.usage?.output_tokens ?? '-'} ${keep.map(k => k.cmd).join(',') || '-'}${res.error ? ' ' + res.error : ''}`);
    }
  }
  return rows;
}

export function summarize(rows) {
  const ids = [...new Set(rows.map(r => r.id))];
  const made = rows.filter(r => !r.skipped);
  const per = Object.fromEntries(ids.map(id => { const rs = made.filter(r => r.id === id); return [id, { pass: rs.filter(r => r.pass).length, n: rs.length }]; }));
  const ok = made.filter(r => answered(r.stop));
  return { cases: per, passRate: made.length ? Math.round((100 * made.filter(r => r.pass).length) / made.length) : null, calls: made.length,
    outP50: pctl(ok.map(r => r.out).filter(x => x != null), 0.5), latencyP50: pctl(ok.map(r => r.latencyMs), 0.5), estP50: pctl(made.map(r => r.est), 0.5), cost: Math.round(made.reduce((a, r) => a + r.cost, 0) * 1e4) / 1e4 };
}

async function rescore(files, game = 'ashfall') {
  const cases = Object.fromEntries((await loadCases(game)).map(c => [c.id, c]));
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const r of d.rows) { const c = cases[r.id]; if (c && !r.skipped) r.pass = answered(r.stop) && !!c.expect(r.sent, c.fx.state); }
    d.summary = summarize(d.rows);
    fs.writeFileSync(f, JSON.stringify(d, null, 1));
    console.error(`${path.basename(f)}: pass rate ${d.summary.passRate}%`);
  }
}

function compare(files) {
  const arms = files.map(f => ({ name: path.basename(f, '.json'), ...JSON.parse(fs.readFileSync(f, 'utf8')) }));
  const ids = [...new Set(arms.flatMap(a => Object.keys(a.summary.cases)))];
  console.log(['case'.padEnd(10), ...arms.map(a => a.name.slice(0, 14).padStart(14))].join(''));
  for (const id of ids) console.log([id.padEnd(10), ...arms.map(a => { const c = a.summary.cases[id]; return (c ? `${c.pass}/${c.n}` : '-').padStart(14); })].join(''));
  for (const k of ['passRate', 'outP50', 'latencyP50', 'estP50', 'cost']) console.log([k.padEnd(10), ...arms.map(a => String(a.summary[k]).padStart(14))].join(''));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--compare') { compare(argv.slice(1)); process.exit(0); }
  if (argv[0] === '--rescore') { await rescore(argv.slice(1)); process.exit(0); }
  const pre = await boot(argv, { booleans: BOOL });
  const game = pre.flags.game || 'ashfall';
  const { flags, gameOpts } = parseArgs(argv, { booleans: BOOL, game });
  const model = flags.model || 'claude-sonnet-5';
  if (!flags.prompt && !isScript(model)) { console.error('--prompt is required (the arm is the prompt plus its flags; no default), or --model script:<name>'); process.exit(64); }
  const system = flags.prompt ? fs.readFileSync(flags.prompt, 'utf8') : '';
  const clock = realClock();
  const mod = await loadAdapterModule(game);
  const adapter = mod.createAdapter(process.env, { ...gameOpts, clock, open: true, host: 'ws://127.0.0.1:1' });
  const { toTrigger } = await import(`../src/games/${game}/events.mjs`);
  const cases = await loadCases(game, flags.pick);
  const callModel = flags.dry
    ? async () => ({ act: false, orders: [], note: null, usage: null, stop: 'dry', latencyMs: 0, cost: 0 })
    : await modelFor({ adapter, game, model, system, thinking: flags.thinking, effort: flags.effort, reply: flags.reply, stream: flags.stream, decisionDeadlineMs: flags.decisionDeadline ?? 20000, clock });
  const arm = { model, prompt: sha(system).slice(0, 12), schema: sha(JSON.stringify(adapter.tool)).slice(0, 12), flags: redact(flags), gameOpts: redact(gameOpts) };
  console.error(`bench ${cases.length} cases × ${flags.repeats ?? 3} repeats, prompt ${arm.prompt} schema ${arm.schema} ${flags.slim ? 'slim' : 'full'} ${Object.keys(gameOpts).join(',')}`);
  const rows = await runBench({ adapter, callModel, cases, repeats: flags.repeats ?? 3, toTrigger, flags, divisor: mod.divisor ?? 3.5, clock, log: m => console.error(m) });
  const summary = summarize(rows);
  console.log(JSON.stringify(summary));
  if (flags.out) fs.writeFileSync(flags.out, JSON.stringify({ arm, summary, rows }, null, 1));
}

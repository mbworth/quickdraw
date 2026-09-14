#!/usr/bin/env node
// Layer sensitivity: the bench with one packet layer removed, per layer, against a control. Decides packet content by measured
// decision sensitivity, not by hand (the remembered-layer drop of game 25 is what this catches).
// node bin/sensitivity.mjs [bench arm flags] --repeats 5 --out dir [--layers army,buildings,…] [--control control.json] [--dry]
// Writes dir/control.json and dir/drop-<layer>.json in bench format (bench --compare / --rescore work on them) and prints the table:
// per layer, tokens saved (est, median over the cases that carried it), control vs dropped pass rate over those cases, and the cases that moved.
// Case × layer calls are skipped when the layer renders as `X none` in that case (nothing to remove).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, sha, boot, modelFor, redact, isScript } from './_boot.mjs';
import { loadAdapterModule, parseArgs } from '../src/core/args.mjs';
import { realClock } from '../src/core/clock.mjs';
import { loadCases, runBench, summarize } from './bench.mjs';
import { pctl } from './pace.mjs';

const BOOL = ['dry', 'slim'];
export const DEFAULT_LAYERS = ['header', 'triggers', 'production', 'economy', 'army', 'buildings', 'enemy', 'remembered', 'fields'];   // delta and last are `none` on the bench (no history)

// sensitivity(control, arms) → [{layer, cases, calls, tokensSaved, control, dropped, delta, moved:[{id, from, to}]}]; rates over the cases the layer was present in
export function sensitivity(control, arms) {
  const rate = (rows, ids) => { const rs = rows.filter(r => !r.skipped && ids.has(r.id)); return rs.length ? Math.round((100 * rs.filter(r => r.pass).length) / rs.length) : null; };
  const est = (rows, id) => pctl(rows.filter(r => r.id === id && r.est != null).map(r => r.est), 0.5);
  return arms.map(({ layer, rows }) => {
    const ids = new Set(rows.filter(r => !r.skipped).map(r => r.id));
    const c = rate(control.rows, ids), d = rate(rows, ids);
    const moved = [...ids].map(id => ({ id, from: control.summary.cases[id]?.pass ?? null, to: rows.filter(r => r.id === id && r.pass).length, n: rows.filter(r => r.id === id && !r.skipped).length })).filter(m => m.from !== m.to);
    const saved = [...ids].map(id => est(control.rows, id) - est(rows, id)).filter(x => Number.isFinite(x));
    return { layer, cases: ids.size, calls: rows.filter(r => !r.skipped).length, tokensSaved: saved.length ? pctl(saved, 0.5) : null, control: c, dropped: d, delta: c != null && d != null ? d - c : null, moved };
  });
}

export function table(rows) {
  const out = [['layer', 'cases', 'tok saved', 'control', 'dropped', 'Δ', 'moved (control→dropped)'].map((h, i) => (i ? h.padStart(i === 6 ? 24 : 10) : h.padEnd(12))).join('')];
  for (const r of rows) out.push([r.layer.padEnd(12), String(r.cases).padStart(10), String(r.tokensSaved ?? '-').padStart(10), (r.control == null ? '-' : r.control + '%').padStart(10), (r.dropped == null ? '-' : r.dropped + '%').padStart(10), (r.delta == null ? '-' : (r.delta > 0 ? '+' : '') + r.delta).padStart(10), ('  ' + r.moved.map(m => `${m.id} ${m.from}→${m.to}/${m.n}`).join(', ')).padStart(24)].join(''));
  return out.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const pre = await boot(argv, { booleans: BOOL });
  const game = pre.flags.game || 'ashfall';
  const { flags, gameOpts } = parseArgs(argv, { booleans: BOOL, game });
  if (!flags.out) { console.error('usage: sensitivity [bench arm flags] --repeats N --out dir [--layers a,b] [--control file] [--dry]'); process.exit(64); }
  const model = flags.model || 'claude-sonnet-5';
  if (!flags.prompt && !isScript(model)) { console.error('--prompt is required, or --model script:<name>'); process.exit(64); }
  const system = flags.prompt ? fs.readFileSync(flags.prompt, 'utf8') : '';
  const clock = realClock();
  const mod = await loadAdapterModule(game);
  const adapter = mod.createAdapter(process.env, { ...gameOpts, clock, open: true, host: 'ws://127.0.0.1:1' });
  const { toTrigger } = await import(`../src/games/${game}/events.mjs`);
  const cases = await loadCases(game, flags.pick);
  const callModel = flags.dry
    ? async () => ({ act: false, orders: [], note: null, usage: null, stop: 'dry', latencyMs: 0, cost: 0 })
    : await modelFor({ adapter, game, model, system, thinking: flags.thinking, effort: flags.effort, reply: flags.reply, decisionDeadlineMs: flags.decisionDeadline ?? 20000, clock });
  const layers = flags.layers ? String(flags.layers).split(',') : DEFAULT_LAYERS;
  const repeats = flags.repeats ?? 3;
  const common = { adapter, callModel, cases, repeats, toTrigger, divisor: mod.divisor ?? 3.5, clock, log: m => console.error(m) };
  const armOf = (extra = {}) => ({ model, prompt: sha(system).slice(0, 12), schema: sha(JSON.stringify(adapter.tool)).slice(0, 12), flags: redact({ ...flags, ...extra }), gameOpts: redact(gameOpts) });
  fs.mkdirSync(flags.out, { recursive: true });
  const write = (name, arm, rows) => { const d = { arm, summary: summarize(rows), rows }; fs.writeFileSync(path.join(flags.out, `${name}.json`), JSON.stringify(d, null, 1)); return d; };
  let control;
  if (flags.control) control = JSON.parse(fs.readFileSync(flags.control, 'utf8'));
  else { console.error(`control: ${cases.length} cases × ${repeats}`); control = write('control', armOf(), await runBench({ ...common, flags })); }
  const arms = [];
  for (const layer of layers) {
    console.error(`drop ${layer}`);
    const rows = await runBench({ ...common, flags: { ...flags, dropLayer: layer } });
    write(`drop-${layer}`, armOf({ dropLayer: layer }), rows);
    arms.push({ layer, rows });
  }
  const rows = sensitivity(control, arms);
  fs.writeFileSync(path.join(flags.out, 'sensitivity.json'), JSON.stringify(rows, null, 1));
  console.log(table(rows));
  console.log(`calls ${control.rows.filter(r => !r.skipped).length + arms.reduce((a, x) => a + x.rows.filter(r => !r.skipped).length, 0)}, cost $${Math.round((control.summary.cost + arms.reduce((a, x) => a + x.rows.reduce((b, r) => b + r.cost, 0), 0)) * 100) / 100}`);
}

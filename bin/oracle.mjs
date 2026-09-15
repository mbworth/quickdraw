#!/usr/bin/env node
// Fidelity oracle: does the scripted policy reach the same decision from the packet text as from the raw state?
// For every recorded decision, A = policy(read(the packet the model saw)) and B = policy(facts built straight from the
// state the packet was encoded from). Agreement is the packet's fidelity — one number, no model, no API, free.
// v2/v3: the state side is the FULL state view (facts.mjs: every unit its own A entry with its own state, every building its
// position, F unfolded, X one entry per enemy with its own cell and dB/dA), so the packet's shaping counts too. Note that
// `facts differ` and `decision differs by layer` are CO-attribution: several layers differ on almost every lost decision, and
// only an `--arm` ablation says which one caused it. `facts differ` per layer is the compression loss — what the
// encoder folded away — and `same%` is what that loss plus the budget and the cadence cost the decision; the layers that
// differed on a not-same decision are the attribution.
// `same` is decision equivalence, not text: both order strings are decoded by the game's lang and expanded against the
// recorded state, and the sets of effective commands are compared (ids sorted inside each command). A cluster label and
// the per-unit labels that resolve to the same units are the same order. `exact` stays text equality.
// --arm (v3): the packet side stops being the recorded text and is RE-ENCODED from the recorded inputs under the recorded
// gameOpts overlaid with the `--<game>-*` flags that follow `--arm` (same assemble call as bin/replay.mjs, so `--arm` with
// no overrides reproduces the recorded packet byte for byte and therefore the non-arm numbers exactly). The state side reads
// the same overlaid opts, so one encoder option can be ablated and its share of the lost decisions read off the TOTAL line.
// node bin/oracle.mjs <run.jsonl…> [--every k] [--from N] [--to N] [--policy game38] [--diff] [--out file.json]
//                     [--arm [--<game>-opt value …]]
// Exit 0 always: this is a measurement, not a gate.
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadGameModule, loadAdapterModule, parseArgs } from '../src/core/args.mjs';
import { assemble } from '../src/core/packet.mjs';
import { realClock } from '../src/core/clock.mjs';
import { readRun } from '../src/core/record.mjs';

const snapOf = (rows, ref) => { const r = rows[ref - 1]; if (!r || r.kind !== 'state') throw new Error(`ref ${ref} is not a state line`); return { header: r.header, native: r.native, t: r.st, idx: r.idx }; };
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortIds = c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort(cmp) : v]));
// Layer facts compare order-insensitively: folding F or clustering A reorders lines, and an order is not information lost.
const canon = v => (Array.isArray(v) ? v.map(canon).sort((a, b) => cmp(JSON.stringify(a), JSON.stringify(b))) : v && typeof v === 'object' && !(v instanceof Set) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v);
const pc = (n, d) => (d ? Math.round((100 * n) / d) : null);
const show = v => JSON.stringify(v, (_, x) => (x instanceof Set ? [...x] : x));
const redact = o => JSON.parse(JSON.stringify(o, (k, v) => (/key|token|secret|host/i.test(k) && typeof v === 'string' ? '[redacted]' : v)));   // the summary may be pasted into a note

// armOpts(arm, game) → the gameOpts an `--arm` tail names. An argv array goes through parseArgs, so `false` coerces the
// way every other tool coerces it; an object is taken as given (the programmatic seam). `[]`/`{}` means "arm, no override".
function armOpts(arm, game) {
  if (!Array.isArray(arm)) return { ...arm };
  const { flags, gameOpts } = parseArgs(arm, { game });
  const stray = Object.keys(flags);
  if (stray.length) throw new Error(`--arm takes --${game}-* flags only, got ${stray.join(', ')}`);
  return gameOpts;
}

// oracleRun(file, {every, from, to, policy, arm}) → {run, game, summary, rows}
// arm: null = read the recorded packet; an argv array or opts object = re-encode the packet under those overrides.
export async function oracleRun(file, { every = 1, from = 1, to = Infinity, policy = 'game38', arm = null } = {}) {
  if (!/^[a-z0-9_-]+$/i.test(String(policy))) throw new Error(`bad policy name ${policy}`);
  const rows = readRun(file);
  const cfg = rows[0];
  if (cfg.kind !== 'config') throw new Error('line 1 is not the config');
  const { read } = await loadGameModule(cfg.game, 'read.mjs');
  const { factsOf } = await loadGameModule(cfg.game, 'facts.mjs');
  const { decideFacts } = await loadGameModule(cfg.game, `policy/${policy}.mjs`);
  if (!decideFacts) throw new Error(`policy ${policy} has no decideFacts`);
  const { decode } = await loadGameModule(cfg.game, 'lang.mjs');            // the same decode the pilot runs on the model's string
  const { expand, sig } = await loadGameModule(cfg.game, 'expand.mjs');     // defaults only: no `recent`, so no sticky cmd is suppressed
  const effective = (o, state) => expand(decode({ o }).orders, state, { decidedOn: state }).cmds.map(c => sig(sortIds(c))).sort(cmp);
  const over = arm == null ? null : armOpts(arm, cfg.game);
  const opts = { ...(cfg.gameOpts || {}), ...(over || {}) };   // opts': the recording's, overlaid with the arm
  // The arm's packet is re-encoded exactly the way bin/replay.mjs reproduces one (same adapter, same assemble arguments,
  // same n), so an empty arm is the recorded text byte for byte.
  let packetOf = call => call.packet;
  if (over) {
    const adapter = (await loadAdapterModule(cfg.game)).createAdapter({}, { ...opts, clock: realClock() });
    packetOf = (call, inputs) => assemble(adapter.encode(inputs), { maxTokens: cfg.packetMax, divisor: cfg.divisor, fullEvery: cfg.fullEvery || 0, n: call.n }).text;
  }
  const calls = rows.filter(r => r.kind === 'call' && r.packet != null && r.n >= from && r.n <= to && (r.n - from) % every === 0);
  const out = [], errors = { packet: 0, state: 0, firstPacket: null, firstState: null };
  const layerDiff = {}, attribution = {};
  let exact = 0, same = 0;
  for (const call of calls) {
    const inputs = { state: snapOf(rows, call.stateRef), prevDecisionState: call.prevDecisionRef ? snapOf(rows, call.prevDecisionRef) : null,
      triggers: call.triggers || [], lastOrders: call.lastOrders || [], pending: call.pending || [] };
    let A, B, fa, fb;   // each side is tried and counted on its own: an error on one never hides the other
    const e = {};
    try { fa = read(packetOf(call, inputs)); A = decideFacts(fa); } catch (err) { e.packet = err.message; errors.packet++; errors.firstPacket ??= `n=${call.n}: ${err.message}`; }
    try { fb = factsOf(inputs, opts); B = decideFacts(fb); } catch (err) { e.state = err.message; errors.state++; errors.firstState ??= `n=${call.n}: ${err.message}`; }
    if (e.packet || e.state) { out.push({ n: call.n, err: Object.keys(e).join('+'), ...e }); continue; }
    const keys = Object.keys(fb).filter(k => k !== 'layers');
    const differ = keys.filter(k => !isDeepStrictEqual(canon(fa[k]), canon(fb[k])));
    for (const k of differ) layerDiff[k] = (layerDiff[k] || 0) + 1;
    let ea, eb, eqErr = null;   // an order that will not decode or expand on one side is not-same, and says so
    try { ea = effective(A.o, inputs.state); } catch (err) { eqErr = `packet: ${err.message}`; }
    try { eb = effective(B.o, inputs.state); } catch (err) { eqErr = `${eqErr ? eqErr + '; ' : ''}state: ${err.message}`; }
    const ex = A.o === B.o, sm = !eqErr && isDeepStrictEqual(ea, eb);
    if (ex) exact++;
    if (sm) same++; else for (const k of differ) attribution[k] = (attribution[k] || 0) + 1;
    out.push({ n: call.n, exact: ex, same: sm, a: A.o, b: B.o, whyA: A.why.join(' '), whyB: B.why.join(' '), differ, eqErr: eqErr || undefined,
      eff: sm ? undefined : { a: ea, b: eb },
      values: sm ? undefined : Object.fromEntries(differ.map(k => [k, [show(fa[k]), show(fb[k])]])),
      missing: [...fb.layers].filter(t => !fa.layers.has(t)) });
  }
  const decided = out.filter(r => !r.err).length;
  return { run: path.basename(file), game: cfg.game, policy, gameOpts: redact(opts), arm: over && redact(over),
    summary: { decisions: out.length, decided, exact, exactPct: pc(exact, decided), same, samePct: pc(same, decided), errors, layerDiff, attribution }, rows: out };
}

const pad = (s, n) => String(s).padEnd(n);
const counts = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}${n}`).join(' ') || '-';
const line = (name, s) => [pad(name, 22), pad(`${s.decided}/${s.decisions}`, 12), pad(s.exactPct ?? '-', 7), pad(s.samePct ?? '-', 7),
  pad(`${s.errors.packet}/${s.errors.state}`, 11), pad(counts(s.layerDiff), 22), counts(s.attribution)].join('');
const HEAD = [pad('run', 22), pad('decided', 12), pad('exact%', 7), pad('same%', 7), pad('err p/s', 11), pad('facts differ', 22), 'decision differs by layer'].join('');

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const files = [], flags = {}, armArgv = [];
  let arm = false;   // --arm is bare; after it a hyphenated flag (--<game>-*) is a gameOpt, oracle's own flags still work
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { files.push(a); continue; }
    const eq = a.indexOf('='), k = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (k === 'arm') { arm = true; continue; }
    if (arm && k.includes('-')) { armArgv.push(a); if (eq < 0) { const v = argv[++i]; if (v === undefined) { console.error(`--${k} needs a value`); process.exit(64); } armArgv.push(v); } continue; }
    flags[k] = k === 'diff' ? true : eq >= 0 ? a.slice(eq + 1) : argv[++i];
  }
  if (!files.length) { console.error('usage: oracle <run.jsonl…> [--every k] [--from N] [--to N] [--policy game38] [--diff] [--out file.json] [--arm [--<game>-opt v …]]'); process.exit(64); }
  const opts = { every: Number(flags.every ?? 1), from: Number(flags.from ?? 1), to: flags.to ? Number(flags.to) : Infinity, policy: flags.policy ?? 'game38', arm: arm ? armArgv : null };
  const all = [];
  if (arm) console.log(`arm (packet re-encoded): ${armArgv.length ? armArgv.join(' ') : 'no overrides — must reproduce the recorded packet'}`);
  console.log(HEAD);
  for (const f of files) {
    let r;
    try { r = await oracleRun(f, opts); } catch (e) { console.log(`${pad(path.basename(f), 22)}${e.message}`); continue; }
    all.push(r); console.log(line(r.run, r.summary));
    if (flags.diff) for (const d of r.rows.filter(x => !x.err && !x.same)) {
      console.log(`n=${d.n} [${d.whyA}] vs [${d.whyB}]${d.missing.length ? ` missing ${d.missing.join('')}` : ''}${d.eqErr ? ` err ${d.eqErr}` : ''}\n  packet: ${d.a}\n  state:  ${d.b}\n  eff:    ${(d.eff?.a || []).join(' ')}\n     vs   ${(d.eff?.b || []).join(' ')}`);
      for (const k of d.differ) console.log(`  ${k}: packet ${d.values[k][0]}\n  ${' '.repeat(k.length)}  state  ${d.values[k][1]}`);
    }
  }
  const tot = { decisions: 0, decided: 0, exact: 0, same: 0, errors: { packet: 0, state: 0 }, layerDiff: {}, attribution: {} };
  for (const r of all) {
    const s = r.summary;
    tot.decisions += s.decisions; tot.decided += s.decided; tot.exact += s.exact; tot.same += s.same;
    tot.errors.packet += s.errors.packet; tot.errors.state += s.errors.state;
    for (const [k, n] of Object.entries(s.layerDiff)) tot.layerDiff[k] = (tot.layerDiff[k] || 0) + n;
    for (const [k, n] of Object.entries(s.attribution)) tot.attribution[k] = (tot.attribution[k] || 0) + n;
  }
  tot.exactPct = pc(tot.exact, tot.decided); tot.samePct = pc(tot.same, tot.decided);
  console.log(line(`TOTAL ${all.length} runs${arm ? ' [arm]' : ''}`, tot));
  if (flags.out) fs.writeFileSync(flags.out, JSON.stringify({ opts, arm: arm ? (all[0]?.arm ?? {}) : null, armArgv: arm ? armArgv : null, runs: all }, null, 1));
}

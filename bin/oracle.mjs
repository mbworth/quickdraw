#!/usr/bin/env node
// Fidelity oracle: does the scripted policy reach the same decision from the packet text as from the raw state?
// For every recorded decision, A = policy(read(the packet the model saw)) and B = policy(facts built straight from the
// state the packet was encoded from). Agreement is the packet's fidelity — one number, no model, no API, free.
// A disagreement is attributed to the layers whose facts differ, so the packet's losses (a layer on the --full-every
// cadence, a line cut to --packet-max) are named rather than guessed.
// node bin/oracle.mjs <run.jsonl…> [--every k] [--from N] [--to N] [--policy game38] [--diff] [--out file.json]
// Exit 0 always: this is a measurement, not a gate.
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadGameModule } from '../src/core/args.mjs';
import { readRun } from '../src/core/record.mjs';

const snapOf = (rows, ref) => { const r = rows[ref - 1]; if (!r || r.kind !== 'state') throw new Error(`ref ${ref} is not a state line`); return { header: r.header, native: r.native, t: r.st, idx: r.idx }; };
const norm = o => (o === '-' ? o : o.split('; ').sort().join('; '));
const pc = (n, d) => (d ? Math.round((100 * n) / d) : null);
const show = v => JSON.stringify(v, (_, x) => (x instanceof Set ? [...x] : x));
const redact = o => JSON.parse(JSON.stringify(o, (k, v) => (/key|token|secret|host/i.test(k) && typeof v === 'string' ? '[redacted]' : v)));   // the summary may be pasted into a note

// oracleRun(file, {every, from, to, policy}) → {run, game, summary, rows}
export async function oracleRun(file, { every = 1, from = 1, to = Infinity, policy = 'game38' } = {}) {
  if (!/^[a-z0-9_-]+$/i.test(String(policy))) throw new Error(`bad policy name ${policy}`);
  const rows = readRun(file);
  const cfg = rows[0];
  if (cfg.kind !== 'config') throw new Error('line 1 is not the config');
  const { read } = await loadGameModule(cfg.game, 'read.mjs');
  const { factsOf } = await loadGameModule(cfg.game, 'facts.mjs');
  const { decideFacts } = await loadGameModule(cfg.game, `policy/${policy}.mjs`);
  if (!decideFacts) throw new Error(`policy ${policy} has no decideFacts`);
  const opts = cfg.gameOpts || {};
  const calls = rows.filter(r => r.kind === 'call' && r.packet != null && r.n >= from && r.n <= to && (r.n - from) % every === 0);
  const out = [], errors = { packet: 0, state: 0, firstPacket: null, firstState: null };
  const layerDiff = {}, attribution = {};
  let exact = 0, same = 0;
  for (const call of calls) {
    const inputs = { state: snapOf(rows, call.stateRef), prevDecisionState: call.prevDecisionRef ? snapOf(rows, call.prevDecisionRef) : null,
      triggers: call.triggers || [], lastOrders: call.lastOrders || [], pending: call.pending || [] };
    let A, B, fa, fb;   // each side is tried and counted on its own: an error on one never hides the other
    const e = {};
    try { fa = read(call.packet); A = decideFacts(fa); } catch (err) { e.packet = err.message; errors.packet++; errors.firstPacket ??= `n=${call.n}: ${err.message}`; }
    try { fb = factsOf(inputs, opts); B = decideFacts(fb); } catch (err) { e.state = err.message; errors.state++; errors.firstState ??= `n=${call.n}: ${err.message}`; }
    if (e.packet || e.state) { out.push({ n: call.n, err: Object.keys(e).join('+'), ...e }); continue; }
    const keys = Object.keys(fb).filter(k => k !== 'layers');
    const differ = keys.filter(k => !isDeepStrictEqual(fa[k], fb[k]));
    for (const k of differ) layerDiff[k] = (layerDiff[k] || 0) + 1;
    const ex = A.o === B.o, sm = norm(A.o) === norm(B.o);
    if (ex) exact++;
    if (sm) same++; else for (const k of differ) attribution[k] = (attribution[k] || 0) + 1;
    out.push({ n: call.n, exact: ex, same: sm, a: A.o, b: B.o, whyA: A.why.join(' '), whyB: B.why.join(' '), differ,
      values: sm ? undefined : Object.fromEntries(differ.map(k => [k, [show(fa[k]), show(fb[k])]])),
      missing: [...fb.layers].filter(t => !fa.layers.has(t)) });
  }
  const decided = out.filter(r => !r.err).length;
  return { run: path.basename(file), game: cfg.game, policy, gameOpts: redact(opts),
    summary: { decisions: out.length, decided, exact, exactPct: pc(exact, decided), same, samePct: pc(same, decided), errors, layerDiff, attribution }, rows: out };
}

const pad = (s, n) => String(s).padEnd(n);
const counts = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}${n}`).join(' ') || '-';
const line = (name, s) => [pad(name, 22), pad(`${s.decided}/${s.decisions}`, 12), pad(s.exactPct ?? '-', 7), pad(s.samePct ?? '-', 7),
  pad(`${s.errors.packet}/${s.errors.state}`, 11), pad(counts(s.layerDiff), 22), counts(s.attribution)].join('');
const HEAD = [pad('run', 22), pad('decided', 12), pad('exact%', 7), pad('same%', 7), pad('err p/s', 11), pad('facts differ', 22), 'decision differs by layer'].join('');

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const files = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { files.push(a); continue; }
    const eq = a.indexOf('='), k = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    flags[k] = k === 'diff' ? true : eq >= 0 ? a.slice(eq + 1) : argv[++i];
  }
  if (!files.length) { console.error('usage: oracle <run.jsonl…> [--every k] [--from N] [--to N] [--policy game38] [--diff] [--out file.json]'); process.exit(64); }
  const opts = { every: Number(flags.every ?? 1), from: Number(flags.from ?? 1), to: flags.to ? Number(flags.to) : Infinity, policy: flags.policy ?? 'game38' };
  const all = [];
  console.log(HEAD);
  for (const f of files) {
    let r;
    try { r = await oracleRun(f, opts); } catch (e) { console.log(`${pad(path.basename(f), 22)}${e.message}`); continue; }
    all.push(r); console.log(line(r.run, r.summary));
    if (flags.diff) for (const d of r.rows.filter(x => !x.err && !x.same)) {
      console.log(`n=${d.n} [${d.whyA}] vs [${d.whyB}]${d.missing.length ? ` missing ${d.missing.join('')}` : ''}\n  packet: ${d.a}\n  state:  ${d.b}`);
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
  console.log(line(`TOTAL ${all.length} runs`, tot));
  if (flags.out) fs.writeFileSync(flags.out, JSON.stringify({ opts, runs: all }, null, 1));
}

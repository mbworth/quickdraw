#!/usr/bin/env node
// node bin/classes.mjs <run.jsonl>… : what each trigger class buys. A call is attributed to its first (highest-ranked) trigger; per class:
// calls and their share, how often the model ordered nothing, orders sent per call, the share of raw orders that reached the game and were
// accepted, the reaction to the first order, and how the class fared at the engine (fired, coalesced behind a call in flight, cooldown).
// Free, from the run files: the cooldown and heartbeat settings should follow this table, not a guess.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRun } from '../src/core/record.mjs';
import { answered } from '../src/core/model.mjs';
import { pctl } from './pace.mjs';

const r1 = x => (x == null ? null : Math.round(x * 10) / 10);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

// classStats(rows) → {classes: {cls: {...}}, calls}
export function classStats(rows) {
  const calls = rows.filter(r => r.kind === 'call' && !r.skipped && answered(r.stop) && r.triggers?.length);
  const byN = new Map(rows.filter(r => r.kind === 'decision').map(d => [d.n, d]));
  const resN = new Map(rows.filter(r => r.kind === 'result').map(r => [r.n, r.results || []]));
  const per = {};
  const get = cls => (per[cls] ??= { calls: 0, noop: 0, raw: 0, sent: 0, ok: 0, drops: {}, react: [], first: [], fired: 0, coalesced: 0, cooldown: 0, keys: {} });
  for (const c of calls) {
    const tr = c.triggers[0], s = get(tr.cls), d = byN.get(c.n);
    s.calls++; s.keys[tr.key] = (s.keys[tr.key] || 0) + 1;
    if (!d) continue;
    const raw = d.orders?.length ?? 0, sent = d.sent?.length ?? 0;
    if (!sent) s.noop++;
    s.raw += raw; s.sent += sent; s.ok += (resN.get(c.n) || []).filter(x => x.ok).length;
    for (const x of d.dropped || []) s.drops[x.reason] = (s.drops[x.reason] || 0) + 1;
    if (sent && c.latency) { s.react.push(c.latency.totalMs); if (c.latency.firstSendMs != null) s.first.push(c.latency.firstSendMs); }
  }
  for (const t of rows.filter(r => r.kind === 'trigger')) for (const o of t.outcomes || []) { const s = get(o.cls); if (o.outcome === 'fired') s.fired++; else if (o.outcome === 'coalesced') s.coalesced++; else if (o.outcome === 'cooldown') s.cooldown++; }
  const total = calls.length;
  const out = {};
  for (const [cls, s] of Object.entries(per)) {
    out[cls] = { calls: s.calls, share: pct(s.calls, total), noopPct: pct(s.noop, s.calls), sentPerCall: s.calls ? r1(s.sent / s.calls) : null, keptPct: pct(s.sent, s.raw), okPct: pct(s.ok, s.sent),
      reactP50: pctl(s.react, 0.5), firstP50: s.first.length ? pctl(s.first, 0.5) : null, fired: s.fired, coalesced: s.coalesced, cooldown: s.cooldown,
      drops: Object.fromEntries(Object.entries(s.drops).sort((a, b) => b[1] - a[1]).slice(0, 3)), keys: Object.fromEntries(Object.entries(s.keys).sort((a, b) => b[1] - a[1]).slice(0, 3)) };
  }
  return { classes: out, calls: total };
}

export function table(stats) {
  const cols = ['class', 'calls', 'share', 'no-op', 'sent/call', 'kept', 'ok', 'react p50', 'first p50', 'fired', 'coalesced', 'cooldown', 'top drops', 'top keys'];
  const w = [10, 6, 6, 6, 10, 6, 5, 10, 10, 6, 10, 9, 28, 30];
  const line = cells => cells.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c ?? '-').padStart(w[i]))).join(' ');
  const rows = Object.entries(stats.classes).sort((a, b) => b[1].calls - a[1].calls).map(([cls, s]) => line([cls, s.calls, s.share == null ? '-' : s.share + '%', s.noopPct == null ? '-' : s.noopPct + '%', s.sentPerCall, s.keptPct == null ? '-' : s.keptPct + '%', s.okPct == null ? '-' : s.okPct + '%', s.reactP50, s.firstP50, s.fired, s.coalesced, s.cooldown,
    Object.entries(s.drops).map(([k, v]) => `${k} ${v}`).join(', '), Object.entries(s.keys).map(([k, v]) => `${k} ${v}`).join(', ')]));
  return [line(cols), ...rows].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: classes <run.jsonl>…'); process.exit(64); }
  const rows = files.flatMap(f => readRun(f));   // several runs pool; decision numbers repeat across runs but each run's own rows join by n within the run
  if (files.length > 1) { const stats = files.map(f => classStats(readRun(f))); const merged = { classes: {}, calls: 0 }; for (const s of stats) { merged.calls += s.calls; } for (const f of files) console.error(`${path.basename(f)}: ${classStats(readRun(f)).calls} calls`); }
  for (const f of files) { console.log(`# ${path.basename(f)}`); console.log(table(classStats(readRun(f)))); console.log(); }
}

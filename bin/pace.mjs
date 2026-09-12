#!/usr/bin/env node
// node bin/pace.mjs <run.jsonl>… : decisions, reaction time, latency split, tokens, cache, orders, cost.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRun } from '../src/core/record.mjs';

export const pctl = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const r1 = x => (x == null ? null : Math.round(x * 10) / 10);
const p50 = xs => r1(pctl(xs, 0.5));

// summarize(rows) → the pace row; `ok` is false when the cache hit rate after call 1 is under 90%.
// Reaction = event arrival → order on wire, over decisions anchored on a real event (not heartbeat/derived) that sent
// orders, decision 1 excluded. Timeouts are counted, not averaged in: a timed-out trigger produced no order at all.
export function summarize(rows) {
  const cfg = rows[0]?.kind === 'config' ? rows[0] : {};
  const calls = rows.filter(r => r.kind === 'call');
  const returned = calls.filter(c => !c.skipped && c.stop === 'tool_use');
  const later = returned.filter(c => c.n > 1);
  const byN = new Map(rows.filter(r => r.kind === 'decision').map(d => [d.n, d]));
  const decisions = [...byN.values()];
  const results = rows.filter(r => r.kind === 'result');
  const states = rows.filter(r => r.kind === 'state');
  const done = rows.find(r => r.kind === 'done');
  const withOrders = later.filter(c => (c.anchor ?? 'event') === 'event' && byN.get(c.n)?.sent.length);
  const L = k => later.map(c => c.latency?.[k]).filter(x => x != null);
  const gt = states.map(s => s.gt).filter(x => x != null);
  const wall = rows.length > 1 ? (rows[rows.length - 1].t - rows[0].t) / 60000 : 0;
  const minutes = gt.length > 1 ? (gt[gt.length - 1] - gt[0]) / 60 : wall;
  const tokens = later.map(c => c.packetMeta?.realTokens).filter(x => x != null);
  const warm = calls.filter(c => c.n > 1 && c.usage);
  const hits = warm.filter(c => c.usage.cache_read_input_tokens > 0).length;
  const hitRate = warm.length ? hits / warm.length : null;
  const sent = decisions.reduce((n, d) => n + d.sent.length, 0);
  const dropped = decisions.reduce((n, d) => n + d.dropped.length, 0);
  const rejected = results.reduce((n, r) => n + r.results.filter(x => !x.ok).length, 0);
  const rateLimited = results.reduce((n, r) => n + r.results.filter(x => /rate limited/.test(x.error || '')).length, 0);
  const stops = {}; for (const c of calls) stops[c.stop] = (stops[c.stop] || 0) + 1;
  return {
    game: cfg.game, gameId: cfg.gameId, model: cfg.model, promptSha: cfg.promptSha256?.slice(0, 8), schemaSha: cfg.schemaSha256?.slice(0, 8),
    decisions: returned.length, noop: returned.filter(c => byN.get(c.n) && !byN.get(c.n).act).length, timeouts: calls.filter(c => c.stop === 'timeout').length,
    reactionP50: p50(withOrders.map(c => c.latency.totalMs)), reactionP90: r1(pctl(withOrders.map(c => c.latency.totalMs), 0.9)), reactionSamples: withOrders.length,
    waitP50: p50(L('waitMs')), queueP50: p50(L('queueMs')), apiP50: p50(L('apiMs')), sendP50: p50(L('sendMs')), outputP50: pctl(later.map(c => c.usage?.output_tokens).filter(x => x != null), 0.5),
    perMinute: minutes ? r1(returned.length / minutes) : null, minutes: r1(minutes),
    packetP50: pctl(tokens, 0.5), packetSamples: tokens.length, estP50: pctl(later.map(c => c.packetMeta?.estTokens).filter(x => x != null), 0.5),
    cacheHitRate: hitRate == null ? null : r1(hitRate * 100), cacheSamples: warm.length, cacheWriteTokens: calls.reduce((n, c) => n + (c.usage?.cache_creation_input_tokens || 0), 0),
    ordersSent: sent, ordersDropped: dropped, ordersRejected: rejected, keptShare: sent + dropped ? r1((100 * (sent - rejected)) / (sent + dropped)) : null,
    rateLimited, reconnects: rows.filter(r => r.kind === 'reconnect').length, stops,
    outcome: done?.outcome ?? null, why: done?.why ?? null, usd: done?.usd != null ? Math.round(done.usd * 1e4) / 1e4 : null,
    ok: hitRate == null || hitRate >= 0.9,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: pace <run.jsonl>…'); process.exit(64); }
  let bad = 0;
  for (const f of files) {
    const s = summarize(readRun(f));
    console.log(`${path.basename(f)}: ${JSON.stringify(s)}`);
    if (!s.ok) { bad++; console.error(`${path.basename(f)}: FAIL cache hit rate ${s.cacheHitRate}% after call 1 (< 90%)`); }
  }
  process.exit(bad ? 1 : 0);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summarize, pctl, row } from '../../bin/pace.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const usage = (read, out = 50) => ({ input_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: read, output_tokens: out });
const call = (n, total, api, read, stop = 'tool_use', extra = {}) => ({ kind: 'call', t: 1000 * n, n, stop, anchor: 'event', latency: { waitMs: 100, queueMs: 200, totalMs: total, apiMs: api, sendMs: 30 }, usage: usage(read), packetMeta: { estTokens: 100, realTokens: read > 0 ? 400 : null }, ...extra });
const decision = (n, sent, dropped = 0, act = true) => ({ kind: 'decision', t: 1000 * n, n, act, sent: Array(sent).fill({ cmd: 'x' }), dropped: Array(dropped).fill({ reason: 'cap' }) });
const result = (n, oks) => ({ kind: 'result', t: 1000 * n, n, results: oks.map(ok => (ok ? { ok } : { ok, error: 'rate limited: slow down' })) });

test('percentile helper', () => { assert.equal(pctl([5, 1, 3], 0.5), 3); assert.equal(pctl([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9); assert.equal(pctl([], 0.5), null); });

test('summary from a synthetic run with known numbers', () => {
  const rows = [
    { kind: 'config', t: 0, game: 'g', gameId: '7', model: 'm', promptSha256: 'abcdef0123', schemaSha256: '0123456789' },
    { kind: 'state', t: 1, gt: 0 },
    call(1, 9000, 8000, 0), decision(1, 1), result(1, [true]),
    call(2, 2000, 1500, 100), decision(2, 2), result(2, [true, true]),
    call(3, 4000, 3000, 100), decision(3, 3, 1), result(3, [true, false, true]),
    call(4, 3000, 2500, 0), decision(4, 0, 0, false), result(4, []),
    call(7, 1500, 1000, 100, 'tool_use', { anchor: 'tick' }), decision(7, 2), result(7, [true, true]),
    call(5, 0, 6000, null, 'timeout', { skipped: 're-encode', usage: null }),
    { kind: 'reconnect', t: 5500 },
    call(6, 6000, 2000, 100), decision(6, 1), result(6, [true]),
    { kind: 'state', t: 7000, gt: 120 },
    { kind: 'done', t: 7001, outcome: { won: true }, why: 'x', usd: 0.12345 },
  ];
  const s = summarize(rows);
  assert.equal(s.decisions, 6);
  assert.equal(s.noop, 1); assert.equal(s.timeouts, 1);
  assert.equal(s.reactionP50, 4000, 'decision 1 excluded; only event-anchored decisions with orders');
  assert.equal(s.reactionP90, 6000); assert.equal(s.reactionSamples, 3, 'the tick-anchored decision 7 is not a reaction');
  assert.equal(s.apiP50, 2000); assert.equal(s.waitP50, 100); assert.equal(s.queueP50, 200); assert.equal(s.sendP50, 30);
  assert.equal(s.perMinute, 3);
  assert.equal(s.packetP50, 400); assert.equal(s.packetSamples, 4, 'cold-cache samples are invalid');
  assert.equal(s.cacheHitRate, 80); assert.equal(s.cacheSamples, 5, 'every call after the first'); assert.equal(s.cacheWriteTokens, 0); assert.equal(s.ok, false);
  assert.equal(s.ordersSent, 9); assert.equal(s.ordersDropped, 1); assert.equal(s.ordersRejected, 1); assert.equal(s.keptShare, 80);
  assert.equal(s.rateLimited, 1); assert.equal(s.reconnects, 1);
  assert.deepEqual(s.stops, { tool_use: 6, timeout: 1 });
  assert.deepEqual(s.outcome, { won: true }); assert.equal(s.usd, 0.1235);
  assert.equal(s.gameId, '7'); assert.equal(s.promptSha, 'abcdef01');
  const r = row(s, 16);
  assert.match(r, /^\| 16 \| 7 \| m, quickdraw \| \*\*win\*\* \| 2:00 \| 6 decisions \(3\/min\), reaction p50 4 s \/ p90 6 s \(wait 0.1 s\), model p50 2 s, 50 out tokens, packet 400 real, 1 timeouts, kept 80%, 1 rejected, cache 80%, \$0.1235 \|$/);
});

test('the pace CLI fails a run whose cache misses, and replay fails a run whose packet differs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-pace-'));
  try {
    const rows = [{ kind: 'config', t: 0, game: 'mock', gameOpts: {}, packetMax: 600, divisor: 3.5 }, call(1, 1000, 500, 0), decision(1, 1), result(1, [true]), call(2, 1000, 500, 0), decision(2, 1), result(2, [true])];
    const f = path.join(dir, 'cold.jsonl');
    fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    const pace = spawnSync(process.execPath, ['bin/pace.mjs', f], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(pace.status, 1, pace.stderr); assert.match(pace.stderr, /FAIL cache hit rate 0%/);
    const bad = [rows[0], { kind: 'state', t: 1, idx: 1, header: { lifecycle: 'active' }, native: { turn: 1, phase: 'me', pieces: [], score: { me: 0, opp: 0 } } }, { kind: 'call', t: 2, n: 1, stateRef: 2, prevDecisionRef: null, triggers: [], lastOrders: [], packet: 'not what encode makes' }];
    const g = path.join(dir, 'bad.jsonl');
    fs.writeFileSync(g, bad.map(r => JSON.stringify(r)).join('\n') + '\n');
    const replay = spawnSync(process.execPath, ['bin/replay.mjs', g, 'all'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(replay.status, 1, replay.stderr); assert.match(replay.stderr, /0\/1 packets/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

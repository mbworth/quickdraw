import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replayFile } from '../../bin/replay.mjs';
import { runPilot } from '../../src/core/pilot.mjs';
import { createRecorder } from '../../src/core/record.mjs';
import { virtualClock } from '../../src/core/clock.mjs';
import { createAdapter } from '../../src/games/mock/index.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-replay-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('replay reproduces every recorded mock packet byte for byte', async () => {
  const clock = virtualClock(1000);
  const adapter = createAdapter({}, { clock, seed: 2, turns: 3 });
  await adapter.seat({});
  const rec = createRecorder(path.join(dir, 'mock-2.jsonl'), { clock, statePolicy: 'on-decision' });
  rec.writeNow('config', { game: 'mock', gameOpts: { seed: 2, turns: 3 }, packetMax: 600, divisor: 3.5 });
  const cm = async () => ({ act: true, orders: [{ cmd: 'move', id: 1, to: 2 }], usage: null, stop: 'tool_use', latencyMs: 0, cost: 0 });
  const p = runPilot({ adapter, callModel: cm, clock, record: rec, opts: { heartbeatMs: 100000, deadlineMarginMs: 100 } });
  await clock.advance(4000);
  await p;
  rec.flushAndClose();
  const out = await replayFile(rec.file, 'all');
  assert.ok(out.length >= 3);
  for (const r of out) assert.equal(r.replayed, r.recorded, `decision ${r.n}`);
});

// Review 2026-09-14: under --overlap the call row recorded whatever `lastOrders` was when the call returned, not what the packet
// was encoded from, so games 27–37 replayed ~25% of packets. Two calls in flight with different durations, distinct orders each.
test('replay reproduces every packet of an overlapping run: the call row holds the last orders its packet used', async () => {
  const clock = virtualClock(1000);
  const adapter = createAdapter({}, { clock, seed: 3, turns: 4 });
  await adapter.seat({});
  const rec = createRecorder(path.join(dir, 'mock-3.jsonl'), { clock, statePolicy: 'all' });
  rec.writeNow('config', { game: 'mock', gameOpts: { seed: 3, turns: 4 }, packetMax: 600, divisor: 3.5 });
  let k = 0;
  const cm = async () => { const i = ++k; await new Promise(r => clock.setTimeout(r, i % 2 ? 1500 : 100)); return { act: true, orders: [{ cmd: 'move', id: 1, to: 1 + (i % 5) }], usage: null, stop: 'tool_use', latencyMs: 0, cost: 0 }; };
  const p = runPilot({ adapter, callModel: cm, clock, record: rec, opts: { heartbeatMs: 200, deadlineMarginMs: 100, maxInFlight: 2, staleAfterMs: 5000 } });
  await clock.advance(8000);
  await p;
  rec.flushAndClose();
  const out = await replayFile(rec.file, 'all');
  const rows = fs.readFileSync(rec.file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  assert.ok(rows.some(r => r.kind === 'call' && r.overlap > 0), 'the run had calls in flight together');
  assert.ok(out.length >= 3);
  for (const r of out) assert.equal(r.replayed, r.recorded, `decision ${r.n}`);
});

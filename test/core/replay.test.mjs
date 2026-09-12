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

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replayTrajectory, summarize } from '../../bin/trajectory.mjs';
import { runPilot } from '../../src/core/pilot.mjs';
import { createRecorder, readRun } from '../../src/core/record.mjs';
import { virtualClock } from '../../src/core/clock.mjs';
import { createAdapter } from '../../src/games/mock/index.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-traj-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('a recorded mock game replays open-loop under a different model and is scored against the recording', async () => {
  const clock = virtualClock(1000);
  const adapter = createAdapter({}, { clock, seed: 3, turns: 4 });
  await adapter.seat({});
  const rec = createRecorder(path.join(dir, 'mock-3.jsonl'), { clock, statePolicy: 'on-decision' });
  rec.writeNow('config', { game: 'mock', gameOpts: { seed: 3, turns: 4 }, packetMax: 600, divisor: 3.5 });
  const live = async () => ({ act: true, orders: [{ cmd: 'move', id: 1, to: 2 }], usage: null, stop: 'tool_use', latencyMs: 0, cost: 0 });
  const p = runPilot({ adapter, callModel: live, clock, record: rec, opts: { heartbeatMs: 100000, deadlineMarginMs: 100 } });
  await clock.advance(5000);
  await p;
  rec.flushAndClose();
  const rows = readRun(rec.file);
  const calls = rows.filter(r => r.kind === 'call' && r.packet != null);
  assert.ok(calls.length >= 3);
  const packets = [];
  const arm = async ({ packet }) => { packets.push(packet); return { act: packets.length % 2 === 1, orders: [{ cmd: 'move', id: 1, to: 2 }], usage: { output_tokens: 7 }, stop: 'tool_use', latencyMs: 3, cost: 0.001 }; };
  const replayAdapter = createAdapter({}, { clock, seed: 3, turns: 4 });
  const out = await replayTrajectory({ rows, adapter: replayAdapter, callModel: arm, divisor: 3.5, clock });
  assert.equal(out.length, calls.length);
  assert.deepEqual(packets, calls.map(c => c.packet), 'the arm saw the recorded packets byte for byte (same config)');
  const s = summarize(out);
  assert.equal(s.decisions, calls.length); assert.equal(s.failed, 0); assert.equal(s.outP50, 7);
  assert.ok(s.noopPct > 0 && s.noopPct < 100, 'the arm no-oped every other decision');
  assert.ok(s.sameKinds < 100, 'so some decisions differ from the recording');
  const sampled = await replayTrajectory({ rows, adapter: replayAdapter, callModel: arm, divisor: 3.5, clock, every: 2 });
  assert.equal(sampled.length, Math.ceil(calls.length / 2));
});

test('scoreRules tallies applies and passes for the arm and the recording separately', async () => {
  const { scoreRules } = await import('../../bin/trajectory.mjs');
  const rules = [{ id: 'act', when: s => s.hot, pass: sent => sent.length > 0 }, { id: 'never', when: () => false, pass: () => true }];
  const rows = [
    { n: 1, stop: 'tool_use', sent: [{ cmd: 'x' }], dropped: [], recorded: [] },
    { n: 2, stop: 'tool_use', sent: [], dropped: [], recorded: [{ cmd: 'x' }] },
    { n: 3, stop: 'timeout', sent: [{ cmd: 'x' }], dropped: [], recorded: [{ cmd: 'x' }] },
  ];
  const s = scoreRules(rows, n => ({ hot: n !== 2 }), rules);
  assert.deepEqual(s.arm, { act: { applies: 2, pass: 1 }, never: { applies: 0, pass: 0 } }, 'a failed call counts as no orders');
  assert.deepEqual(s.recorded, { act: { applies: 2, pass: 1 }, never: { applies: 0, pass: 0 } });
});

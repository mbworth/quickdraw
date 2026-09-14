// Review 2026-09-14 regressions (docs/reviews/2026-09-14-full.md S1 items 2 and 3).
// Probe 1: --stream + finish() mid-call -> orders already sent are not recorded as a decision.
// Probe 2: recorder opened 'a' on an existing run file -> every ref off by the old line count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { runPilot } from '../../src/core/pilot.mjs';
import { createRecorder, readRun } from '../../src/core/record.mjs';
import { virtualClock } from '../../src/core/clock.mjs';
import { createAdapter } from '../../src/games/mock/index.mjs';

const memRecorder = () => { const lines = []; return { lines, writeNow(k,o){lines.push({kind:k,...o});return lines.length;}, writeState(s){return this.ensureState(s);}, ensureState(s){ if(!s._ref){lines.push({kind:'state',idx:s.idx}); s._ref=lines.length;} return s._ref;}, flush(){}, flushAndClose(){} }; };

test('P1: stream + finish mid-call loses the sent orders from the run file', async () => {
  const clock = virtualClock(1000);
  const adapter = createAdapter({}, { clock, seed: 1, turns: 2, faults: [{ at: 500, kind: 'doneMidCall' }] });
  await adapter.connect(); await adapter.seat({});
  const record = memRecorder();
  const callModel = async ({ onOrders }) => {                     // stub ignores the abort signal, like the real one under test
    await new Promise(r => clock.setTimeout(r, 300));
    onOrders([{ cmd: 'move', id: 1, to: 5 }]);                    // chunk out at t+300, before the done at t+500
    await new Promise(r => clock.setTimeout(r, 900));
    return { act: true, orders: [{ cmd: 'move', id: 1, to: 5 }], note: null, usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 100, output_tokens: 5 }, stop: 'tool_use', latencyMs: 1200, cost: 0.001, streamed: 1 };
  };
  const p = runPilot({ adapter, callModel, clock, record, opts: { heartbeatMs: 100000, deadlineMarginMs: 100, stream: true, staleAfterMs: 5000 } });
  await clock.advance(4000);
  await p;
  const calls = record.lines.filter(l => l.kind === 'call');
  console.log('sent to hub:', JSON.stringify(adapter.sent));
  console.log('call lines:', JSON.stringify(calls.map(c => ({ n: c.n, skipped: c.skipped, partial: c.partial }))));
  console.log('decision lines:', JSON.stringify(record.lines.filter(l => l.kind === 'decision')));
  console.log('result lines:', JSON.stringify(record.lines.filter(l => l.kind === 'result')));
  assert.equal(adapter.sent.length, 1, 'an order reached the hub');
  assert.equal(record.lines.filter(l => l.kind === 'decision').length, 1, 'the run file records it as a decision');
});

test('P2: a second recorder on the same run file makes every ref off by the old line count', async () => {
  const clock = virtualClock(0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-rec-'));
  const file = path.join(dir, 'mock-5.jsonl');
  const r1 = createRecorder(file, { clock });
  r1.writeNow('config', { game: 'mock' }); r1.writeNow('x', {}); r1.writeNow('y', {});
  r1.flushAndClose();
  const r2 = createRecorder(file, { clock });
  r2.writeNow('config', { game: 'mock' });
  const ref = r2.ensureState({ idx: 1, t: 0, header: { lifecycle: 'active' }, native: {} });
  r2.flushAndClose();
  const rows = readRun(file);
  console.log('ref returned:', ref, 'rows:', rows.length, 'row[ref-1].kind:', rows[ref - 1].kind);
  assert.equal(rows[ref - 1].kind, 'state', 'the ref points at the state line it names');
});

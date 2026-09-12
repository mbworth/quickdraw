import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRecorder, guardExit, readRun } from '../../src/core/record.mjs';
import { virtualClock } from '../../src/core/clock.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-rec-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const lines = readRun;
const snap = (idx, t = 0) => ({ idx, t, header: { lifecycle: 'active', clocks: { game: idx } }, native: { idx } });

test('states buffer, immediate lines flush the ordered queue', async () => {
  const clock = virtualClock();
  const f = path.join(dir, 'a.jsonl');
  const rec = createRecorder(f, { clock });
  assert.equal(rec.writeState(snap(1)), 1);
  assert.equal(fs.readFileSync(f, 'utf8'), '', 'state is buffered');
  assert.equal(rec.writeNow('call', { n: 1 }), 2);
  assert.deepEqual(lines(f).map(l => [l.kind, l.idx ?? l.n]), [['state', 1], ['call', 1]]);
  rec.writeState(snap(2));
  await clock.advance(250);
  assert.equal(lines(f).length, 3, 'timer flush');
  rec.flushAndClose();
});

test('policy on-decision writes states only when referenced; sampled every Nth', () => {
  const clock = virtualClock();
  const rec = createRecorder(path.join(dir, 'b.jsonl'), { clock, statePolicy: 'on-decision' });
  assert.equal(rec.writeState(snap(1)), null);
  assert.equal(rec.ensureState(snap(1)), 1);
  assert.equal(rec.ensureState(snap(1)), 1);
  rec.flushAndClose();
  const s = createRecorder(path.join(dir, 'c.jsonl'), { clock, statePolicy: 'sampled', sampleEvery: 2 });
  assert.equal(s.writeState(snap(1)), null);
  assert.equal(s.writeState(snap(2)), 1);
  s.flushAndClose();
});

test('signal handler flushes the buffer', () => {
  const clock = virtualClock();
  const f = path.join(dir, 'd.jsonl');
  const rec = createRecorder(f, { clock });
  rec.writeState(snap(1));
  let got = null;
  const off = guardExit(rec, { onSignal: s => { got = s; } });
  process.emit('SIGTERM');
  off();
  assert.equal(got, 'SIGTERM');
  assert.deepEqual(lines(f).map(l => l.kind), ['state', 'exit']);
  assert.equal(rec.writeNow('done', {}), 3, 'with onSignal the recorder stays open for the done line');
});

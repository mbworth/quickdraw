import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { simulate, splitArgs } from '../../bin/replay-commander.mjs';
import { ROOT } from '../../bin/_boot.mjs';
import { readRun } from '../../src/core/record.mjs';
import { feedbackLayer, expectTracker } from '../../src/core/commander.mjs';
import { apply, measure } from '../../src/games/microrts/policy/commander.mjs';
import { DEFAULTS, decide } from '../../src/games/microrts/policy/rush.mjs';

const RUN = path.join(ROOT, 'runs/microrts-basesWorkers16x16-GuidedRojoA3N-mub5ms7q.jsonl');
const rowsOf = () => readRun(RUN);

test('simulate reconstructs one launch per landed commander seq', t => {
  if (!fs.existsSync(RUN)) return t.skip('run file absent');
  const rows = rowsOf().slice(0, 200);
  const seqs = new Set(rows.filter(r => r.kind === 'call' && r.raw?.commander?.input && !r.raw.commander.error).map(r => r.raw.commander.seq));
  const results = simulate(rows, { apply, decide, DEFAULTS });
  assert.deepEqual(results.map(r => r.seq), [...seqs].sort((a, b) => a - b));
  const track = expectTracker(measure);
  for (const c of results) {
    for (const pk of c.since) track.see(pk);
    assert.ok(feedbackLayer({ ...c.fb, expect: track.read() }).startsWith('F '));
  }
});

// The run predates the tracker's first-claim `since` fix, so `claim since tN` is not compared.
test('simulate: the recorded model F equals the live F on the first 30 landings (at-clause stripped)', t => {
  if (!fs.existsSync(RUN)) return t.skip('run file absent');
  const rows = rowsOf();
  const rec = new Map(rows.filter(r => r.kind === 'call' && r.raw?.commander?.input).map(r => [r.raw.commander.seq, r.raw.commander.feedback]));
  const norm = s => s.replace(/ \| at target[^|]*/, '').replace(/claim since t\d+/, 'claim since');
  const calls = simulate(rows, { apply, decide, DEFAULTS, measure }).slice(0, 30);
  assert.equal(calls.length, 30);
  for (const c of calls) assert.equal(norm(feedbackLayer({ ...c.fb, expect: c.oldExpect })), norm(rec.get(c.seq)), `seq ${c.seq}`);
});

test('splitArgs: flags first, leftover positional', () => {
  assert.deepEqual(splitArgs(['--prompt', 'p.md', 'run.jsonl', '--dry-run', '--at', '--from-seq=3'], ['dry-run', 'at']),
    { flagArgs: ['--prompt', 'p.md', '--dry-run', '--at', '--from-seq=3'], positional: ['run.jsonl'] });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sensitivity, table, DEFAULT_LAYERS } from '../../bin/sensitivity.mjs';
import { summarize } from '../../bin/bench.mjs';

const row = (id, rep, pass, est, skipped = null) => ({ id, rep, pass: skipped ? null : pass, est: skipped ? null : est, stop: skipped ? 'skipped' : 'tool_use', skipped, out: 5, latencyMs: 1, cost: 0.001, sent: [], dropped: [] });
const arm = rows => ({ summary: summarize(rows), rows });

test('sensitivity rates control and dropped over the cases the layer was present in, and lists the cases that moved', () => {
  const control = arm([row('a', 1, true, 100), row('a', 2, true, 100), row('b', 1, true, 120), row('b', 2, false, 120)]);
  const drop = [
    { layer: 'army', rows: [row('a', 1, false, 60), row('a', 2, true, 60), row('b', 1, true, 80), row('b', 2, false, 80)] },
    { layer: 'enemy', rows: [row('a', 1, true, 100, 'absent'), row('a', 2, true, 100, 'absent'), row('b', 1, true, 110), row('b', 2, true, 110)] },
  ];
  const r = sensitivity(control, drop);
  assert.deepEqual(r[0], { layer: 'army', cases: 2, calls: 4, tokensSaved: 40, control: 75, dropped: 50, delta: -25, moved: [{ id: 'a', from: 2, to: 1, n: 2 }] });
  assert.deepEqual(r[1], { layer: 'enemy', cases: 1, calls: 2, tokensSaved: 10, control: 50, dropped: 100, delta: 50, moved: [{ id: 'b', from: 1, to: 2, n: 2 }] });
  const t = table(r);
  assert.match(t, /army .* 40 .* 75% .* 50% .* -25 .*a 2→1\/2/);
  assert.ok(!DEFAULT_LAYERS.includes('delta') && !DEFAULT_LAYERS.includes('last'));
});

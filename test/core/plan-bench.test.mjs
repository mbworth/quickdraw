import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failLine, pool } from '../../bin/plan-bench.mjs';

test('failLine: reports steps, why, train, pushLight from the tool input', () => {
  assert.equal(failLine('c', { steps: null, why: null, train: 'li', pushLight: 3 }), 'c: steps=null why=null train=li pushLight=3');
  assert.equal(failLine('c', { steps: [{ do: 'x', until: { metric: 'army', op: '>=', value: 5, by: 900 } }], why: 'go', train: 'hv', pushLight: 4 }),
    'c: steps=[{"do":"x","until":{"metric":"army","op":">=","value":5,"by":900}}] why=go train=hv pushLight=4');
});

test('failLine: no input (error) still reports a line', () => {
  assert.equal(failLine('c', null), 'c: steps=null why=null train=undefined pushLight=undefined');
});

test('pool: runs every item at the given concurrency, order of completion not guaranteed', async () => {
  const seen = [];
  await pool([1, 2, 3, 4, 5], 2, async i => { seen.push(i); });
  assert.deepEqual(seen.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test('pool: empty items resolves with no calls', async () => {
  let calls = 0;
  await pool([], 4, async () => { calls++; });
  assert.equal(calls, 0);
});

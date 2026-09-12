import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerStats } from '../../bin/layers.mjs';

const L = (name, text, lines) => ({ name, priority: 1, text, lines: lines?.map(t => ({ text: t, priority: 1 })) });
const rec = layers => layers.flatMap(l => [l.text, ...(l.lines || []).map(x => x.text)]).join('\n');
const replay = (n, layers) => ({ n, layers, recorded: rec(layers) });

test('per-layer tokens, constant and repeat shares from replayed layers', () => {
  const a = [L('header', 'H t1'), L('fields', 'F', ['f1 o10', 'f2 ?', 'f3 ?'])];
  const b = [L('header', 'H t2'), L('fields', 'F', ['f1 o9', 'f2 ?', 'f3 ?'])];
  const c = [L('header', 'H t3'), L('fields', 'F', ['f1 o9', 'f2 ?', 'f3 ?'])];
  const s = layerStats([replay(1, a), replay(2, b), replay(3, c)], 1);
  assert.equal(s.decisions, 2, 'decision 1 has no previous packet');
  assert.equal(s.packetP50, 'H t2\nF\nf1 o9\nf2 ?\nf3 ?'.length);
  assert.equal(s.repeatShareP50, 80, 'packet b: F, f2, f3 of 5 lines repeat; c: 4 of 5; median of 60 and 80 rounds up');
  assert.equal(s.layers.header.constant, 0); assert.equal(s.layers.header.repeat, 0); assert.equal(s.layers.header.tokP50, 4);
  assert.equal(s.layers.fields.constant, 50, 'identical in c only');
  assert.equal(s.layers.fields.repeat, 100, 'median of 75 and 100');
  assert.equal(s.layers.fields.share, 77.3, '17 of 22 chars');
});

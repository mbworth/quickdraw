import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../../src/core/packet.mjs';

const L = (name, priority, text, extra = {}) => ({ name, priority, text, ...extra });

test('priority 0 never drops, higher priorities go first', () => {
  const layers = [L('h', 0, 'H'.repeat(40)), L('a', 1, 'A'.repeat(40)), L('b', 3, 'B'.repeat(40)), L('c', 2, 'C'.repeat(40))];
  const r = assemble(layers, { maxTokens: 30, divisor: 1 });
  assert.deepEqual(r.kept.map(k => k.name), ['h']);
  assert.deepEqual(r.dropped.map(d => d.name), ['b', 'c', 'a']);
  assert.equal(r.text, 'H'.repeat(40));
  assert.equal(r.estTokens, 40);
});

test('lines trim by descending priority before the layer goes', () => {
  const layers = [L('h', 0, 'H'), L('u', 2, 'U', { lines: [{ text: 'x1', priority: 1 }, { text: 'y2', priority: 2 }, { text: 'z2', priority: 2 }] })];
  const r = assemble(layers, { maxTokens: 6, divisor: 1 });
  assert.equal(r.text, 'H\nU\nx1');
  assert.equal(r.kept[1].droppedLines, 2);
  const r2 = assemble(layers, { maxTokens: 2, divisor: 1 });
  assert.equal(r2.text, 'H');
  assert.deepEqual(r2.dropped, [{ name: 'u', reason: 'budget', lines: 3 }]);
});

test('full layers appear only every Nth packet when fullEvery is set', () => {
  const layers = [L('h', 0, 'H'), L('f', 3, 'F', { full: true })];
  assert.equal(assemble(layers, { fullEvery: 3, n: 1 }).text, 'H\nF', 'decision 1 is always full');
  assert.equal(assemble(layers, { fullEvery: 3, n: 3 }).text, 'H');
  assert.equal(assemble(layers, { fullEvery: 3, n: 4 }).text, 'H\nF');
  assert.equal(assemble(layers, { fullEvery: 0, n: 4 }).text, 'H\nF');
});

test('estimate uses the divisor', () => {
  assert.equal(assemble([L('h', 0, 'x'.repeat(35))], { divisor: 3.5 }).estTokens, 10);
});

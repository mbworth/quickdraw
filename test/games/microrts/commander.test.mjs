// The commander split: apply() clamps a tool answer into params, and rush.mjs plays from those params.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../../../src/games/microrts/coder.mjs';
import { read } from '../../../src/games/microrts/read.mjs';
import { decide, decideFacts, DEFAULTS } from '../../../src/games/microrts/policy/rush.mjs';
import { defaults, apply } from '../../../src/games/microrts/policy/commander.mjs';
import { assemble } from '../../../src/core/packet.mjs';
import { tinySnap } from './helpers.mjs';

test('defaults mirrors rush.DEFAULTS with target:null', () => {
  assert.deepEqual(defaults, { ...DEFAULTS, target: null });
});

test('apply clamps in-range fields and falls back on bad ones', () => {
  const prev = { ...defaults, harvesters: 1, defend: 8, panic: 4, target: { x: 3, y: 4 } };
  const p = apply({ harvesters: 5, workers: 99, barracksAt: 3, defend: 10, panic: 20, pushLight: 4, pushWorkers: 7, post: 2, target: '9,9' }, prev);
  assert.equal(p.harvesters, 5);
  assert.equal(p.workers, 12);   // 99 clamped to the 1-12 range
  assert.equal(p.defend, 10);
  assert.equal(p.panic, 10);     // clamped to the new defend, not the raw 20
  assert.deepEqual(p.target, { x: 9, y: 9 });
});

test('apply falls back to prev on missing/malformed fields; null target clears it', () => {
  const prev = { ...defaults, target: { x: 1, y: 1 } };
  const p = apply({}, prev);
  assert.deepEqual(p, prev);
  assert.equal(apply({ target: 'nope' }, prev).target, prev.target);
  assert.equal(apply({ target: '20,3' }, prev).target, prev.target);   // out of 0-15
  assert.equal(apply({ target: null }, prev).target, null);
  assert.equal(apply({ harvesters: 3.5 }, prev).harvesters, prev.harvesters);
});

// A packet with three idle workers and one node: harvesters:3 tops all three up, the default tops up only two.
test('decide with harvesters:3 produces three harvest orders where the default produces two', () => {
  const W = (id, x, y) => ({ id, type: 'Worker', player: 0, x, y, hp: 1, carry: 0, busy: false, st: 'idle', eta: 0, idleFor: 0 });
  const inp = { state: tinySnap({ units: [
    { id: 1, type: 'Resource', player: -1, x: 0, y: 0, hp: 1, carry: 25, busy: false, st: 'idle', eta: 0, idleFor: 0 },
    { id: 2, type: 'Base', player: 0, x: 5, y: 5, hp: 10, busy: false, st: 'idle', eta: 0, idleFor: 0, carry: 0 },
    W(3, 4, 5), W(5, 6, 5), W(7, 5, 4),
    { id: 4, type: 'Worker', player: 1, x: 15, y: 15, hp: 1, carry: 0, busy: false, st: 'idle', eta: 0, idleFor: 0 },
  ] }), prevDecisionState: null, triggers: [], lastOrders: [], pending: [] };
  const text = assemble(encode(inp), { maxTokens: 400, divisor: 3.5 }).text;
  const count = o => (o.match(/^h /) ? o.split('; ').filter(c => c.startsWith('h ')).length : 0);
  assert.equal(count(decide(text).o), 2);
  assert.equal(count(decide(text, { ...DEFAULTS, harvesters: 3 }).o), 3);
  assert.deepEqual(decide(text, { ...DEFAULTS, harvesters: 3 }), decideFacts(read(text), { ...DEFAULTS, harvesters: 3 }));
});

// target overrides the push destination: three Light and their base gone from range of any raid, so rule 6 fires.
test('target overrides the push destination when the push condition holds', () => {
  const k = {
    h: { r: 0 }, p: [], e: [],
    a: [{ type: 'li', n: 3, x: 5, y: 5, state: 'i', ids: [1, 2, 3], label: 'li x3@5,5' }],
    b: [{ type: 'ba', id: 20, x: 5, y: 5, hp: 10 }],
    x: [{ type: 'ba', n: 1, x: 10, y: 10, dB: null, dA: null, ids: [], label: 'ba x1@10,10' }],
  };
  assert.equal(decideFacts(k).o, 'a #1,#2,#3 10,10');
  assert.equal(decideFacts(k, { ...DEFAULTS, target: { x: 1, y: 14 } }).o, 'a #1,#2,#3 1,14');
});

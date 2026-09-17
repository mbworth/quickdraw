// train: the barracks cycles through a comma list of unit types instead of always Light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, decideFacts, DEFAULTS } from '../../../src/games/microrts/policy/rush.mjs';

const BASE = { h: { r: 5 }, p: [], e: [], a: [], b: [{ type: 'ba', id: 20, x: 5, y: 5, hp: 10 }, { type: 'br', id: 30, x: 6, y: 5, hp: 4 }], x: [] };

test('default train (li) is byte-identical to the old hardcoded barracks order', () => {
  const text = ['H t100 r5 u1/0', 'D none', 'T hb', 'P none', 'E none', 'A', 'li x1@5,5 i #1', 'B ba#20@5,5 hp10 br#30@6,5 hp4', 'X none', 'L none'].join('\n');
  assert.equal(decide(text).o, 't 30 li 5; t 20 wk 5; a #1 5,5');
});

test('train with one type keeps count 5, regardless of army size', () => {
  const k = { ...BASE, a: [{ type: 'li', n: 2, x: 5, y: 5, state: 'i', ids: [1, 2] }] };
  assert.equal(decideFacts(k, { ...DEFAULTS, train: 'hv' }).o.split('; ')[0], 't 30 hv 5');
});

test('train with a mix: 0 army (idle barracks) picks the first type, count 1', () => {
  const k = { ...BASE, a: [{ type: 'wk', n: 1, x: 5, y: 5, state: 'i', ids: [7] }] };
  assert.equal(decideFacts(k, { ...DEFAULTS, train: 'li,hv' }).o.split('; ')[0], 't 30 li 1');
});

test('train with a mix: one Light alive advances the cycle to the next type', () => {
  const k = { ...BASE, a: [{ type: 'li', n: 1, x: 5, y: 5, state: 'i', ids: [8] }] };
  assert.equal(decideFacts(k, { ...DEFAULTS, train: 'li,hv' }).o.split('; ')[0], 't 30 hv 1');
});

test('train with a mix: bank short of the next type cost skips the barracks order', () => {
  const k = { ...BASE, h: { r: 2 }, a: [{ type: 'li', n: 1, x: 5, y: 5, state: 'i', ids: [8] }] };
  const r = decideFacts(k, { ...DEFAULTS, train: 'li,hv' });
  assert.ok(!r.o.includes('30 hv'));
  assert.ok(!r.why.includes('buy:hv'));
});

test('train with a mix: barracks currently producing counts as +1 toward the cycle', () => {
  const k = { ...BASE, p: [{ type: 'br', id: 30, make: 'li', idle: false }], a: [{ type: 'li', n: 1, x: 5, y: 5, state: 'i', ids: [8] }] };
  // n = 1(army) + 1(producing) = 2 -> types[2 % 2] = types[0] = 'li'
  assert.equal(decideFacts(k, { ...DEFAULTS, train: 'li,hv' }).o.split('; ')[0], 't 30 li 1');
});

test('no raid, no enemy mobile unit, but an enemy building on X: every free fighter pushes it, why push:last', () => {
  const k = {
    h: { r: 0 }, p: [], e: [],
    a: [{ type: 'li', n: 1, x: 5, y: 5, state: 'i', ids: [9] }],
    b: [{ type: 'ba', id: 20, x: 5, y: 5, hp: 10 }],
    x: [{ type: 'br', n: 1, x: 12, y: 12, dB: 23, dA: null, ids: [] }],
  };
  const r = decideFacts(k, DEFAULTS);
  assert.equal(r.o, 'a #9 12,12');
  assert.deepEqual(r.why, ['buy:none', 'push:last']);
});

test('push:last does not fire while the enemy still has a mobile unit on X', () => {
  const k = {
    h: { r: 0 }, p: [], e: [],
    a: [{ type: 'li', n: 1, x: 5, y: 5, state: 'i', ids: [9] }],
    b: [{ type: 'ba', id: 20, x: 5, y: 5, hp: 10 }],
    x: [{ type: 'br', n: 1, x: 12, y: 12, dB: 23, dA: null, ids: [] }, { type: 'wk', n: 1, x: 13, y: 12, dB: 25, dA: null, ids: [40] }],
  };
  assert.notEqual(decideFacts(k, DEFAULTS).why.at(-1), 'push:last');
});

test('push target: no base on X falls to their other building, not the far node', () => {
  const k = {
    h: { r: 0 }, p: [], e: [{ type: 'rs', id: 1, x: 0, y: 15, o: 5, d: 20 }],
    a: [{ type: 'li', n: 3, x: 5, y: 5, state: 'i', ids: [1, 2, 3] }],
    b: [{ type: 'ba', id: 20, x: 5, y: 5, hp: 10 }],
    x: [{ type: 'br', n: 1, x: 12, y: 12, dB: 5, dA: null, ids: [] }, { type: 'wk', n: 1, x: 13, y: 13, dB: 20, dA: null, ids: [41] }],
  };
  const r = decideFacts(k, DEFAULTS);   // army(3) >= pushLight(3): rule 6 fires
  assert.equal(r.o, 'a #1,#2,#3 12,12');
  assert.equal(r.why.at(-1), 'push');
});

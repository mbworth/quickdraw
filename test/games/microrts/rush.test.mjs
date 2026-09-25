// train: the barracks cycles through a comma list of unit types instead of always Light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, decideFacts, DEFAULTS } from '../../../src/games/microrts/policy/rush.mjs';

const BASE = { h: { r: 5 }, p: [], e: [], a: [], b: [{ type: 'ba', id: 20, x: 5, y: 5, hp: 10 }, { type: 'br', id: 30, x: 6, y: 5, hp: 4 }], x: [] };

test('default train (li) keeps the barracks order and a worker count of 1 once it stands', () => {
  const text = ['H t100 r5 u1/0', 'D none', 'T hb', 'P none', 'E none', 'A', 'li x1@5,5 i #1', 'B ba#20@5,5 hp10 br#30@6,5 hp4', 'X none', 'L none'].join('\n');
  assert.equal(decide(text).o, 't 30 li 5; t 20 wk 1; a #1 5,5');
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

const GB = { h: { r: 0 }, p: [], e: [], b: [{ type: 'ba', id: 20, x: 5, y: 5, hp: 10 }], x: [{ type: 'ba', n: 1, x: 15, y: 15, dB: null, dA: null, ids: [] }] };
const LI3 = [
  { type: 'li', n: 1, x: 7, y: 5, state: 'i', ids: [1] },
  { type: 'li', n: 1, x: 6, y: 5, state: 'i', ids: [2] },
  { type: 'li', n: 1, x: 8, y: 5, state: 'i', ids: [3] },
];

test('guard 0 matches the defaults exactly', () => {
  const k = { ...GB, a: LI3 };
  assert.deepEqual(decideFacts(k, { ...DEFAULTS, guard: 0 }), decideFacts(k, DEFAULTS));
  assert.equal(decideFacts(k, DEFAULTS).o, 'a #2,#1,#3 15,15');
});

test('guard 1 with 3 li pushing: the li nearest my base holds the post, 2 push', () => {
  const r = decideFacts({ ...GB, a: LI3 }, { ...DEFAULTS, guard: 1 });
  assert.equal(r.o, 'a #1,#3 15,15; a #2 6,6');
  assert.deepEqual(r.why.slice(-2), ['push:last', 'guard']);
});

test('guard at or above army: everyone holds the post', () => {
  const r = decideFacts({ ...GB, a: LI3 }, { ...DEFAULTS, guard: 3 });
  assert.equal(r.o, 'a #2,#1,#3 6,6');
  assert.equal(r.why.at(-1), 'guard');
});

test('guard never picks a worker', () => {
  const k = { ...GB, a: [{ type: 'wk', n: 2, x: 5, y: 4, state: 'i', ids: [8, 9] }, ...LI3] };
  const r = decideFacts(k, { ...DEFAULTS, harvesters: 0, workers: 1, guard: 1 });
  assert.equal(r.o, 'a #1,#3,#9 15,15; a #2 6,6');
});

const WK3 = [{ type: 'wk', n: 3, x: 5, y: 6, state: 'i', ids: [1, 2, 3] }];
const BR2 = [...BASE.b, { type: 'br', id: 31, x: 4, y: 5, hp: 4 }];

test('barracks 1 matches the defaults exactly', () => {
  for (const k of [BASE, { ...BASE, a: WK3 }, { ...BASE, b: BR2, h: { r: 4 }, a: WK3 }]) assert.deepEqual(decideFacts(k, { ...DEFAULTS, barracks: 1 }), decideFacts(k, DEFAULTS));
});

test('barracks 2 with one br standing, 3 workers, bank 5: a second barracks', () => {
  const k = { ...BASE, a: WK3 };
  assert.match(decideFacts(k, { ...DEFAULTS, barracks: 2 }).o, /^t #\d+ br 1/);
  assert.doesNotMatch(decideFacts(k, DEFAULTS).o, /br 1/);
});

test('barracks 2 with two br standing: no build', () => {
  assert.doesNotMatch(decideFacts({ ...BASE, b: BR2, a: WK3 }, { ...DEFAULTS, barracks: 2 }).o, /br 1/);
});

test('two idle br, bank 4, train li: both train', () => {
  const r = decideFacts({ ...BASE, b: BR2, h: { r: 4 }, a: WK3 }, { ...DEFAULTS, barracks: 2 });
  assert.equal(r.o, 't 30 li 5; t 31 li 5; a #2,#3 5,5');
});

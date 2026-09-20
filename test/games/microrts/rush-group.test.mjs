// group: push waits for stragglers within `group` of the army's centroid. engage: a raid outside panic needs at
// least `engage` free army units to sortie, otherwise fighters hold the post; workers-only defence is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideFacts, DEFAULTS } from '../../../src/games/microrts/policy/rush.mjs';

const BASE = { h: { r: 0 }, p: [], e: [], b: [{ type: 'ba', id: 20, x: 5, y: 5, hp: 10 }] };

test('push with a straggler: core pushes at their base, straggler joins the core', () => {
  const k = {
    ...BASE,
    a: [
      { type: 'li', n: 1, x: 5, y: 5, state: 'i', ids: [1] },
      { type: 'li', n: 1, x: 6, y: 5, state: 'i', ids: [2] },
      { type: 'li', n: 1, x: 7, y: 5, state: 'i', ids: [3] },
      { type: 'li', n: 1, x: 0, y: 5, state: 'i', ids: [4] },   // fresh spawn back at the barracks
    ],
    x: [{ type: 'ba', n: 1, x: 15, y: 15, dB: null, dA: null, ids: [] }],
  };
  const r = decideFacts(k, DEFAULTS);
  assert.equal(r.o, 'a #1,#2,#3 15,15; a #4 6,5');
  assert.equal(r.why.at(-1), 'push:join');
});

test('push with a lone front: core is the largest cluster, not whoever leads', () => {
  const k = {
    ...BASE,
    b: [{ type: 'ba', id: 20, x: 0, y: 0, hp: 10 }],
    a: [
      { type: 'li', n: 1, x: 4, y: 4, state: 'i', ids: [1] },
      { type: 'li', n: 1, x: 5, y: 4, state: 'i', ids: [2] },
      { type: 'li', n: 1, x: 4, y: 5, state: 'i', ids: [3] },
      { type: 'li', n: 1, x: 12, y: 12, state: 'i', ids: [4] },   // alone out front, closest to dest
    ],
    x: [{ type: 'ba', n: 1, x: 15, y: 15, dB: null, dA: null, ids: [] }],
  };
  const r = decideFacts(k, { ...DEFAULTS, pushLight: 3 });
  assert.equal(r.o, 'a #1,#2,#3 15,15; a #4 4,4');
  assert.equal(r.why.at(-1), 'push:join');
});

test('push scattered: two far apart with core short of pushLight gathers at centroid', () => {
  const k = {
    ...BASE,
    a: [
      { type: 'li', n: 1, x: 5, y: 5, state: 'i', ids: [1] },
      { type: 'li', n: 1, x: 15, y: 5, state: 'i', ids: [2] },
    ],
    x: [{ type: 'ba', n: 1, x: 15, y: 15, dB: null, dA: null, ids: [] }],
  };
  const r = decideFacts(k, { ...DEFAULTS, pushLight: 3 });
  assert.equal(r.o, 'a #1,#2 10,5');
  assert.equal(r.why.at(-1), 'push:gather');
});

test('push grouped: army within group of centroid attacks their base', () => {
  const k = {
    ...BASE,
    a: [
      { type: 'li', n: 1, x: 5, y: 5, state: 'i', ids: [1] },
      { type: 'li', n: 1, x: 6, y: 5, state: 'i', ids: [2] },
    ],
    x: [{ type: 'ba', n: 1, x: 15, y: 15, dB: null, dA: null, ids: [] }],
  };
  const r = decideFacts(k, DEFAULTS);
  assert.equal(r.o, 'a #1,#2 15,15');
  assert.equal(r.why.at(-1), 'push:last');
});

test('raid outside panic with 1 free army unit: below engage, holds at post', () => {
  const k = {
    ...BASE,
    a: [{ type: 'li', n: 1, x: 4, y: 5, state: 'i', ids: [1] }],
    x: [
      { type: 'ba', n: 1, x: 15, y: 15, dB: null, dA: null, ids: [] },
      { type: 'li', n: 1, x: 8, y: 5, dB: 3, dA: null, ids: [40] },
    ],
  };
  const r = decideFacts(k, DEFAULTS);   // defend 6 default, panic 2: dB 3 raids but does not panic
  assert.equal(r.o, 'a #1 6,6');   // post: one step from base (5,5) toward their base (15,15)
  assert.equal(r.why.at(-1), 'defend:hold');
});

test('raid outside panic with 2 free army units: meets engage, sorties', () => {
  const k = {
    ...BASE,
    a: [
      { type: 'li', n: 1, x: 4, y: 5, state: 'i', ids: [1] },
      { type: 'li', n: 1, x: 4, y: 6, state: 'i', ids: [2] },
    ],
    x: [{ type: 'li', n: 1, x: 8, y: 5, dB: 3, dA: null, ids: [40] }],
  };
  const r = decideFacts(k, DEFAULTS);
  assert.equal(r.o, 'a #1,#2 8,5');
  assert.equal(r.why.at(-1), 'defend');
});

test('panic with 1 free army unit still fights: engage gate does not apply inside panic', () => {
  const k = {
    ...BASE,
    a: [{ type: 'li', n: 1, x: 5, y: 5, state: 'i', ids: [1] }],
    x: [{ type: 'li', n: 1, x: 6, y: 5, dB: 1, dA: null, ids: [40] }],
  };
  const r = decideFacts(k, DEFAULTS);   // dB 1 <= panic 2
  assert.equal(r.o, 'a #1 6,5');
  assert.equal(r.why.at(-1), 'defend:panic');
});

test('mop-up: no enemy buildings, army hunts the last enemy unit by id', () => {
  const k = {
    h: { r: 0 }, p: [], e: [{ type: 'rs', id: 16, x: 1, y: 1, o: 25, d: null }],
    b: [{ type: 'ba', id: 20, x: 2, y: 2, hp: 10 }],
    a: [
      { type: 'li', n: 1, x: 10, y: 10, state: 'i', ids: [1] },
      { type: 'li', n: 1, x: 11, y: 10, state: 'i', ids: [2] },
      { type: 'li', n: 1, x: 10, y: 11, state: 'i', ids: [3] },
    ],
    x: [{ type: 'wk', n: 1, x: 2, y: 12, dB: 10, dA: null, ids: [99] }],
  };
  const r = decideFacts(k, DEFAULTS);
  assert.equal(r.o, 'a #1,#2,#3 99');
  assert.equal(r.why.at(-1), 'push:hunt');
});

test('no army, workers only, raid: old behaviour preserved, free (non-builder) workers defend', () => {
  const k = {
    ...BASE,
    a: [{ type: 'wk', n: 1, x: 4, y: 5, state: 'i', ids: [9] }, { type: 'wk', n: 1, x: 4, y: 6, state: 'i', ids: [10] }],
    x: [{ type: 'li', n: 1, x: 8, y: 5, dB: 3, dA: null, ids: [40] }],
  };
  const r = decideFacts(k, DEFAULTS);   // worker #9 (nearer base) is the standing "builder" candidate, excluded from free; #10 defends
  assert.equal(r.o, 'a #10 8,5');
  assert.equal(r.why.at(-1), 'defend');
});

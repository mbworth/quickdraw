import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../../src/games/ashfall/validate.mjs';

const state = over => ({ header: {}, native: { ore: 100, crystal: 0, supply: { used: 9, cap: 10 }, upgrades: { weapons: 0 },
  mine: [{ id: 1, type: 'core', queue: [] }, { id: 2, type: 'worker' }, { id: 3, type: 'trooper' }, { id: 4, type: 'barracks', queue: [] }, { id: 5, type: 'depot', progress: 0.5 }, { id: 6, type: 'armory', queue: ['weapons'] }],
  enemyVisible: [{ id: 40, type: 'raider' }], ...over } });
const reasons = r => r.dropped.map(d => d.reason);

test('attack needs a visible target and live units', () => {
  const r = validate([{ cmd: 'attack', units: [3], target: 40 }, { cmd: 'attack', units: [3], target: 41 }, { cmd: 'attack', units: [99], target: 40 }, { cmd: 'attack', units: ['army'], target: 40 }], state());
  assert.equal(r.keep.length, 2);
  assert.deepEqual(reasons(r), ['no-target', 'dead']);
});

test('unit cmds with only dead or building ids drop; selectors keep', () => {
  const r = validate([{ cmd: 'move', units: [1], x: 0, z: 0 }, { cmd: 'stop', units: [99, 3] }, { cmd: 'gather', units: ['workers'], ore: null }], state());
  assert.deepEqual(reasons(r), ['dead']);
  assert.equal(r.keep.length, 2);
});

test('train checks building, kind, supply, ore and crystal, threading the bank', () => {
  const r = validate([
    { cmd: 'train', building: 4, type: 'trooper' }, { cmd: 'train', building: 4, type: 'trooper' },
    { cmd: 'train', building: 1, type: 'trooper' }, { cmd: 'train', building: 5, type: 'worker' }, { cmd: 'train', building: 4, type: 'siege' },
  ], state());
  assert.equal(r.keep.length, 1);
  assert.deepEqual(reasons(r), ['capped', 'nobld', 'nobld', 'capped']);
  const c = validate([{ cmd: 'train', building: 4, type: 'raider' }], state({ supply: { used: 1, cap: 10 } }));
  assert.deepEqual(reasons(c), ['nocry']);
  const o = validate([{ cmd: 'train', building: 4, type: 'trooper' }, { cmd: 'train', building: 4, type: 'trooper' }], state({ supply: { used: 1, cap: 10 } }));
  assert.deepEqual(reasons(o), ['noore']);
});

test('build needs ore and a live worker', () => {
  const r = validate([{ cmd: 'build', workers: [2], type: 'depot', x: 0, z: 0 }, { cmd: 'build', workers: [2], type: 'depot', x: 0, z: 0 }, { cmd: 'build', workers: [99], type: 'wall', x: 0, z: 0 }, { cmd: 'build', workers: [2], type: 'castle', x: 0, z: 0 }], state());
  assert.equal(r.keep.length, 1);
  assert.deepEqual(reasons(r), ['noore', 'dead', 'bad-type']);
});

test('research needs a finished armory, an unmaxed level and the bank', () => {
  const s = state({ ore: 300, crystal: 100 });
  const r = validate([{ cmd: 'research', building: 6, key: 'weapons' }, { cmd: 'research', building: 6, key: 'refine' }, { cmd: 'research', building: 4, key: 'optics' }, { cmd: 'research', building: 6, key: 'optics' }], s);
  assert.deepEqual(reasons(r), ['nobld', 'noore']);
  assert.equal(r.keep.length, 2);
  assert.deepEqual(reasons(validate([{ cmd: 'research', building: 6, key: 'optics' }], state({ ore: 300, crystal: 100, upgrades: { optics: 1 } }))), ['maxed']);
});

test('cancel and rally need one of my buildings; unknown cmds drop', () => {
  const r = validate([{ cmd: 'cancel', building: 5 }, { cmd: 'rally', building: 77, x: 0, z: 0 }, { cmd: 'wait' }], state());
  assert.deepEqual(reasons(r), ['nobld', 'bad-cmd']);
  assert.equal(r.keep.length, 1);
});

test('a type or key from the object prototype is bad-type and never corrupts the bank', () => {
  const r = validate([{ cmd: 'build', type: 'constructor', workers: [2], x: 0, z: 0 }, { cmd: 'build', type: 'core', workers: [2], x: 0, z: 0 }, { cmd: 'train', type: 'toString', building: 1 }, { cmd: 'research', key: 'valueOf', building: 6 }, { cmd: 'constructor' }], state());
  assert.deepEqual(r.dropped.map(d => d.reason), ['bad-type', 'noore', 'bad-type', 'bad-type', 'bad-cmd']);
  assert.equal(r.keep.length, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../../src/games/microrts/validate.mjs';
import { expand } from '../../../src/games/microrts/expand.mjs';
import { tinySnap, tiny } from './helpers.mjs';

const v = (cmds, over) => validate(cmds, tinySnap(over));

test('production: only what the building makes, only when free, only when affordable, only with a free cell', () => {
  assert.equal(v([{ cmd: 'train', building: 2, type: 'Worker', count: 1 }]).keep.length, 1);
  assert.equal(v([{ cmd: 'train', building: 2, type: 'Light', count: 1 }]).dropped[0].reason, 'bad-type');
  assert.equal(v([{ cmd: 'train', building: 3, type: 'Worker', count: 1 }]).dropped[0].reason, 'bad-type');
  assert.equal(v([{ cmd: 'train', building: 3, type: 'Barracks', count: 1 }]).keep.length, 1, 'a worker produces a barracks');
  assert.equal(v([{ cmd: 'train', building: 99, type: 'Worker', count: 1 }]).dropped[0].reason, 'dead');
  const busy = tiny(); busy.units[1].busy = true; busy.units[1].make = 'Worker';
  assert.equal(validate([{ cmd: 'train', building: 2, type: 'Worker', count: 1 }], { native: busy, header: {} }).dropped[0].reason, 'busy');
  const walking = tiny(); walking.units[2].busy = true;   // a producer that is merely busy keeps the order: the buffer holds it
  assert.equal(validate([{ cmd: 'train', building: 3, type: 'Barracks', count: 1 }], { native: walking, header: {} }).keep.length, 1);
  assert.equal(v([{ cmd: 'train', building: 2, type: 'Worker', count: 1 }], { res: [0, 5] }).dropped[0].reason, 'poor');
  const boxed = tiny();   // wall the base in: 1,1 has neighbours 1,0 0,1 2,1 1,2
  boxed.terrain = [...'0'.repeat(16)].map((c, i) => ([1, 4, 6, 9].includes(i) ? '1' : c)).join('');
  assert.equal(validate([{ cmd: 'train', building: 2, type: 'Worker', count: 1 }], { native: boxed, header: {} }).dropped[0].reason, 'boxed');
});

test('production threads the bank through the list: the second worker is unaffordable at 1 resource', () => {
  const r = v([{ cmd: 'train', building: 2, type: 'Worker', count: 1 }, { cmd: 'train', building: 2, type: 'Worker', count: 1 }], { res: [1, 5] });
  assert.equal(r.keep.length, 1);
  assert.equal(r.dropped[0].reason, 'poor');
});

test('unit orders: dead ids, wrong type, off-map and wall targets', () => {
  assert.equal(v([{ cmd: 'move', units: [3], x: 3, y: 3 }]).keep.length, 1);
  assert.equal(v([{ cmd: 'move', units: [99], x: 3, y: 3 }]).dropped[0].reason, 'dead');
  assert.equal(v([{ cmd: 'move', units: [2], x: 3, y: 3 }]).dropped[0].reason, 'dead');   // a base cannot walk
  assert.equal(v([{ cmd: 'move', units: [4], x: 3, y: 3 }]).dropped[0].reason, 'dead');   // not mine
  assert.equal(v([{ cmd: 'move', units: [3], x: 9, y: 9 }]).dropped[0].reason, 'wall');
  const walled = tiny(); walled.terrain = '0'.repeat(15) + '1';
  assert.equal(validate([{ cmd: 'move', units: [3], x: 3, y: 3 }], { native: walled, header: {} }).dropped[0].reason, 'wall');
});

test('attack: a target must be a live enemy; harvest needs a harvester and a node', () => {
  assert.equal(v([{ cmd: 'attack', units: [3], target: 4 }]).keep.length, 1);
  assert.equal(v([{ cmd: 'attack', units: [3], target: 2 }]).dropped[0].reason, 'gone');   // my own base
  assert.equal(v([{ cmd: 'attack', units: [3], target: 1 }]).dropped[0].reason, 'gone');   // a resource node
  assert.equal(v([{ cmd: 'harvest', units: [3], node: 1 }]).keep.length, 1);
  assert.equal(v([{ cmd: 'harvest', units: [3], node: 2 }]).dropped[0].reason, 'gone');
  const bare = tiny(); bare.units = bare.units.filter(u => u.type !== 'Resource');
  assert.equal(validate([{ cmd: 'harvest', units: [3], node: null }], { native: bare, header: {} }).dropped[0].reason, 'gone');
});

test('expand → validate is the order the pilot runs: a selector that resolves to nothing is bad-id', () => {
  const e = expand([{ cmd: 'attack', units: ['li'], x: 3, y: 3 }], tinySnap());
  assert.equal(e.dropped[0].reason, 'bad-id');
  assert.equal(validate([{ cmd: 'nope' }], tinySnap()).dropped[0].reason, 'bad-cmd');
});

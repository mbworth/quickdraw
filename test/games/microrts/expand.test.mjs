import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expand, clusterIds } from '../../../src/games/microrts/expand.mjs';
import { tinySnap, tiny } from './helpers.mjs';

const E = (cmds, over, decidedOn) => expand(cmds, tinySnap(over), { decidedOn });

test('selectors resolve to my mobile units only', () => {
  assert.deepEqual(E([{ cmd: 'move', units: ['all'], x: 3, y: 3 }]).cmds[0].units, [3]);
  assert.deepEqual(E([{ cmd: 'move', units: ['wk'], x: 3, y: 3 }]).cmds[0].units, [3]);
  const busy = tiny(); busy.units[2].busy = true;
  assert.equal(expand([{ cmd: 'move', units: ['idle'], x: 3, y: 3 }], { native: busy }).dropped[0].reason, 'bad-id');
});

test('a cluster label resolves against the state the packet came from first', () => {
  const moved = tiny(); moved.units[2].x = 3; moved.units[2].y = 0;
  const r = expand([{ cmd: 'move', units: ['wk x1@0,1'], x: 3, y: 3 }], { native: moved }, { decidedOn: tinySnap() });
  assert.deepEqual(r.cmds[0].units, [3], 'the label must resolve on decidedOn, where the unit still stood');
  assert.deepEqual(clusterIds('wk x1@0,1', tinySnap()), [3]);
  assert.equal(clusterIds('zz x1@0,1', tinySnap()), null);
  assert.equal(clusterIds('not a label', tinySnap()), null);
});

test('ids are coerced, duplicates collapse, bad ids are dropped', () => {
  assert.deepEqual(E([{ cmd: 'move', units: ['#3', 3, 'wk#3'], x: 3, y: 3 }]).cmds[0].units, [3]);
  assert.deepEqual(E([{ cmd: 'attack', units: ['#3'], target: 'wk#4' }]).cmds[0].target, 4);
  assert.equal(E([{ cmd: 'move', units: ['banana'], x: 3, y: 3 }]).dropped[0].reason, 'bad-id');
  assert.equal(E([{ cmd: '?', text: 'zzz' }]).dropped[0].reason, 'bad-cmd');
  assert.equal(E([null]).dropped[0].reason, 'bad-cmd');
});

test('train keeps its count (no fan-out: MicroRTS has no queue) and clamps it', () => {
  assert.equal(E([{ cmd: 'train', building: 2, type: 'Worker', count: 9 }]).cmds[0].count, 5);
  assert.equal(E([{ cmd: 'train', building: 2, type: 'Worker' }]).cmds[0].count, 1);
  assert.equal(E([{ cmd: 'train', building: 2, type: 'Worker', count: 2 }]).cmds.length, 1);
});

test('an exact repeat inside one decision is dropped', () => {
  const r = E([{ cmd: 'move', units: ['#3'], x: 3, y: 3 }, { cmd: 'move', units: ['#3'], x: 3, y: 3 }]);
  assert.equal(r.cmds.length, 1);
  assert.equal(r.dropped[0].reason, 'repeat');
});

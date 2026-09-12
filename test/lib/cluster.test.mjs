import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cluster, dist, nearest } from '../../src/lib/cluster.mjs';

test('greedy clustering by type within r, centroid rounded, majority state', () => {
  const ents = [{ id: 1, type: 'trooper', x: 0, z: 0, state: 'idle', hp: 10, max: 10 }, { id: 2, type: 'trooper', x: 6, z: 0, state: 'move', hp: 5, max: 10 }, { id: 3, type: 'trooper', x: 40, z: 0, state: 'idle' }, { id: 4, type: 'worker', x: 1, z: 1, state: 'gather' }];
  const c = cluster(ents, { r: 8 });
  assert.deepEqual(c.map(x => [x.type, x.n, x.x, x.z, x.ids]), [['trooper', 2, 3, 0, [1, 2]], ['trooper', 1, 40, 0, [3]], ['worker', 1, 1, 1, [4]]]);
  assert.equal(c[0].hp, 15); assert.equal(c[0].max, 20);
  assert.equal(cluster([{ id: 9, type: 'raider', x: 0, z: 0 }], { stateOf: e => (e.entrenched ? 'dug' : undefined) })[0].state, undefined);
});

test('dist and nearest', () => {
  assert.equal(dist({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
  const n = nearest({ x: 0, z: 0 }, [{ id: 1, x: 10, z: 0 }, { id: 2, x: 1, z: 1 }]);
  assert.equal(n.e.id, 2);
  assert.equal(nearest({ x: 0, z: 0 }, []).d, Infinity);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffById, rankAndCollapse } from '../../src/core/digest.mjs';

test('diffById reports added, removed and changed per list', () => {
  const prev = { mine: [{ id: 1, hp: 10 }, { id: 2, hp: 5 }], enemy: [] };
  const next = { mine: [{ id: 1, hp: 8 }, { id: 3, hp: 1 }], enemy: [{ id: 9 }] };
  const d = diffById(prev, next, { lists: [{ name: 'mine', path: 'mine', fields: ['hp'] }, { name: 'enemy', path: 'enemy' }] });
  assert.deepEqual(d.mine.added.map(x => x.id), [3]);
  assert.deepEqual(d.mine.removed.map(x => x.id), [2]);
  assert.deepEqual(d.mine.changed.map(c => [c.next.id, c.fields]), [[1, ['hp']]]);
  assert.deepEqual(d.enemy.added.map(x => x.id), [9]);
});

test('diffById tolerates missing lists and function paths', () => {
  const d = diffById({}, { a: { b: [{ id: 1 }] } }, { lists: [{ name: 'x', path: o => o.a?.b }] });
  assert.equal(d.x.added.length, 1);
});

test('rankAndCollapse orders by class then arrival and counts repeats', () => {
  const classes = ['danger', 'info'];
  const out = rankAndCollapse([{ cls: 'info', key: 'a', t: 5 }, { cls: 'danger', key: 'x', t: 9 }, { cls: 'info', key: 'a', t: 1 }, { cls: 'info', key: 'b', t: 2, urgency: -1 }], { classes });
  assert.deepEqual(out.map(x => [x.cls, x.key, x.count, x.t]), [['info', 'b', 1, 2], ['danger', 'x', 1, 9], ['info', 'a', 2, 1]]);
  const all = rankAndCollapse([{ cls: 'info', key: 'a', t: 5 }, { cls: 'info', key: 'a', t: 1 }], { classes });
  assert.deepEqual(all.map(x => [x.count, x.t]), [[2, 1]]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expand, coerceId, sig } from '../../../src/games/ashfall/expand.mjs';

const S = { native: { mine: [{ id: 13, type: 'barracks', queue: ['trooper', 'trooper', 'trooper'] }, { id: 1, type: 'core', queue: [] }, { id: 21, type: 'trooper', x: 40, z: 1 }, { id: 22, type: 'trooper', x: 38, z: 3 }, { id: 23, type: 'trooper', x: 60, z: 1 }, { id: 30, type: 'worker', x: 0, z: 0, state: 'idle' }, { id: 31, type: 'worker', x: 0, z: 0, state: 'gather' }] } };

test('train count fans out and clamps to queue room with a dropped per trim', () => {
  const r = expand([{ cmd: 'train', building: 13, type: 'trooper', count: 4 }], S);
  assert.equal(r.cmds.length, 2);
  assert.deepEqual(r.cmds[0], { cmd: 'train', building: 13, type: 'trooper' });
  assert.deepEqual(r.dropped.map(d => d.reason), ['queue-full', 'queue-full']);
  const two = expand([{ cmd: 'train', building: 1, type: 'worker', count: 3 }, { cmd: 'train', building: 1, type: 'worker', count: 3 }], S);
  assert.equal(two.cmds.length, 5, 'provisional queue counts across cmds');
  assert.equal(two.dropped.length, 1);
});

test('ids coerce from type#id and #id strings; selectors pass; junk is bad-id', () => {
  assert.equal(coerceId('tr#12'), 12); assert.equal(coerceId('#7'), 7); assert.equal(coerceId('9'), 9); assert.equal(coerceId('zz'), null); assert.equal(coerceId(3.5), null);
  const r = expand([{ cmd: 'move', units: ['tr#12', 'army', 4], x: 1, z: 2, attackMove: false }, { cmd: 'attack', units: ['idle'], target: 'rd#40' }, { cmd: 'move', units: ['nope'], x: 0, z: 0, attackMove: false }, { cmd: 'gather', units: [2], ore: null }], S);
  assert.deepEqual(r.cmds[0].units, [12, 'army', 4]);
  assert.equal(r.cmds[1].target, 40);
  assert.deepEqual(r.dropped.map(d => d.reason), ['bad-id']);
  assert.equal(r.cmds[2].ore, null);
});

test('repeats within a decision drop; sticky cmds also drop against recent decisions', () => {
  const b = { cmd: 'build', workers: [2], type: 'depot', x: 1, z: 2 };
  const m = { cmd: 'move', units: ['army'], x: 0, z: 0, attackMove: true };
  const r = expand([b, { ...b }, m, { ...m }], S);
  assert.deepEqual(r.cmds, [b, m]);
  assert.deepEqual(r.dropped.map(d => d.reason), ['repeat', 'repeat']);
  const again = expand([b, m], S, { recent: new Set([sig(b), sig(m)]) });
  assert.deepEqual(again.cmds, [m], 'move may repeat across decisions, build may not');
});

test('malformed cmds are dropped, not thrown', () => {
  const r = expand([null, 5, { x: 1 }, { cmd: 'train', building: 'x', type: 'worker', count: 1 }], S);
  assert.deepEqual(r.dropped.map(d => d.reason), ['bad-cmd', 'bad-cmd', 'bad-cmd', 'bad-id']);
});

test('a pasted cluster label selects that type within 8 of the point; idle workers resolve for build', () => {
  const r = expand([{ cmd: 'move', units: ['tr x2@39,1', 'wk x9@0,0'], x: 1, z: 1, attackMove: true }, { cmd: 'build', workers: ['idle'], type: 'depot', x: 0, z: 0 }], S);
  assert.deepEqual(r.cmds[0].units, [21, 22, 30, 31]);
  assert.deepEqual(r.cmds[1].workers, [30]);
  const none = expand([{ cmd: 'build', workers: ['idle'], type: 'depot', x: 0, z: 0 }], { native: { mine: [{ id: 31, type: 'worker', state: 'gather' }] } });
  assert.deepEqual(none.cmds[0].workers, ['workers']);
  assert.deepEqual(expand([{ cmd: 'stop', units: ['tr x9@-200,-200'] }], S).dropped.map(d => d.reason), ['bad-id'], 'an empty cluster is not a selection');
});

test('inherited object keys are model strings, not cmds or types', () => {
  const r = expand([{ cmd: 'constructor', units: [21] }, { cmd: 'toString' }, { cmd: '__proto__', target: 1 }, { cmd: 'move', units: ['constructor x2@0,0'], x: 0, z: 0 }], S);
  assert.deepEqual(r.dropped.map(d => d.reason), ['bad-cmd', 'bad-cmd', 'bad-cmd', 'bad-id']);
  assert.equal(r.cmds.length, 0);
});

test('sig keeps nested arg values, so distinct nested orders are not repeats', () => {
  assert.notEqual(sig({ cmd: 'x', near: { x: 1, z: 2 } }), sig({ cmd: 'x', near: { x: 9, z: 9 } }));
  assert.equal(sig({ b: 1, a: 2 }), sig({ a: 2, b: 1 }));
});

test('labels resolve against the packet state first; idle means idle harvesters for gather and repair; "all army" splits', () => {
  const moved = { native: { mine: S.native.mine.map(e => (e.type === 'trooper' ? { ...e, x: e.x + 30 } : e)) } };   // the cluster walked 30 since the packet
  const byNewest = expand([{ cmd: 'stop', units: ['tr x2@39,1'] }], moved);
  assert.deepEqual(byNewest.dropped.map(d => d.reason), ['bad-id'], 'the label no longer matches the newest state');
  const byPacket = expand([{ cmd: 'stop', units: ['tr x2@39,1'] }], moved, { decidedOn: S });
  assert.deepEqual(byPacket.cmds[0].units, [21, 22]);
  assert.deepEqual(expand([{ cmd: 'gather', units: ['idle'], ore: null }, { cmd: 'repair', units: ['idle'], target: 5 }, { cmd: 'move', units: ['idle'], x: 0, z: 0, attackMove: false }], S).cmds.map(c => c.units), [[30], [30], ['idle']]);
  const busy = { native: { mine: [{ id: 31, type: 'worker', state: 'gather', x: 0, z: 0 }, { id: 32, type: 'worker', state: 'gather', x: 50, z: 50 }, { id: 40, type: 'turret', x: 48, z: 52, hp: 100, max: 420 }], fields: [{ x: 5, z: 5, nodes: [{ id: 7 }] }] } };
  assert.deepEqual(expand([{ cmd: 'repair', units: ['idle'], target: 40 }], busy).cmds[0].units, [32], 'no idle harvester: the one nearest the turret');
  assert.deepEqual(expand([{ cmd: 'gather', units: ['idle'], ore: 7 }], busy).cmds[0].units, [31], 'nearest the node’s field');
  assert.deepEqual(expand([{ cmd: 'gather', units: ['idle'], ore: null }], { native: { mine: [] } }).dropped.map(d => d.reason), ['bad-id'], 'no harvester at all');
  const mem = { native: { mine: S.native.mine, enemyVisible: [{ id: 90, type: 'trooper', x: 1, z: 1 }], enemyBuildingsRemembered: [{ id: 91, type: 'barracks', x: 70.4, z: -9.6 }] } };
  assert.deepEqual(expand([{ cmd: 'attack', units: ['army'], target: 91 }], mem).cmds[0], { cmd: 'move', units: ['army'], x: 70, z: -10, attackMove: true }, 'a remembered building is attack-moved at');
  assert.deepEqual(expand([{ cmd: 'attack', units: ['army'], target: 90 }], mem).cmds[0].cmd, 'attack', 'a visible target stays an attack');
  assert.deepEqual(expand([{ cmd: 'move', units: ['all army'], x: 0, z: 0, attackMove: true }], S).cmds[0].units, ['all', 'army']);
});

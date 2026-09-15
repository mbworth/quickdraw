import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBuffer } from '../../../src/games/microrts/orders.mjs';
import { ACT } from '../../../src/games/microrts/rules.mjs';
import { tiny } from './helpers.mjs';

const act = (out, id) => out.find(a => a.unitID === id)?.unitAction;

test('a move goal is stepped one cell a cycle and leaves the buffer on arrival', () => {
  const b = createBuffer();
  b.push([{ cmd: 'move', units: [3], x: 3, y: 1 }]);
  const n = tiny();
  const first = act(b.step(n), 3);
  assert.equal(first.type, ACT.MOVE);
  assert.ok(first.parameter === 0 || first.parameter === 2, 'my base sits at 1,1, so the step goes around it');
  assert.equal(b.size, 1, 'the goal stands across cycles');
  n.units[2].x = 3; n.units[2].y = 1;
  b.step(n);
  assert.equal(b.size, 0, 'arrived');
});

test('the path routes around a blocking unit and the map edge', () => {
  const b = createBuffer();
  b.push([{ cmd: 'move', units: [3], x: 2, y: 1 }]);   // 0,1 → 2,1 is blocked at 1,1 by my base
  const a = act(b.step(tiny()), 3);
  assert.equal(a.type, ACT.MOVE);
  assert.ok(a.parameter === 0 || a.parameter === 2, 'must go around, not through the base');
});

test('harvest is a standing round trip: walk, harvest, walk back, return, forever', () => {
  const b = createBuffer();
  b.push([{ cmd: 'harvest', units: [3], node: 1 }]);
  const n = tiny();                                    // worker 0,1 is adjacent to the node at 0,0
  assert.deepEqual(act(b.step(n), 3), { type: ACT.HARVEST, parameter: 0 });
  n.units[2].carry = 1;                                // carrying, base at 1,1 is adjacent
  assert.deepEqual(act(b.step(n), 3), { type: ACT.RETURN, parameter: 1 });
  n.units[2].carry = 0;
  assert.equal(b.size, 1, 'a harvest goal never completes');
  assert.deepEqual(act(b.step(n), 3), { type: ACT.HARVEST, parameter: 0 });
});

test('a named node that is gone falls back to the nearest one', () => {
  const b = createBuffer();
  b.push([{ cmd: 'harvest', units: [3], node: 99 }]);
  assert.equal(act(b.step(tiny()), 3).type, ACT.HARVEST);
});

test('attack hits an adjacent target, walks toward a far one, and completes when it dies', () => {
  const b = createBuffer();
  b.push([{ cmd: 'attack', units: [3], target: 4 }]);
  const n = tiny();
  assert.equal(act(b.step(n), 3).type, ACT.MOVE, 'far away: walk');
  n.units[3].x = 1; n.units[3].y = 0;                  // enemy now adjacent to the worker at 0,1? 0,1 vs 1,0 is diagonal
  n.units[3].x = 0; n.units[3].y = 2;
  assert.deepEqual(act(b.step(n), 3), { type: ACT.ATTACK, x: 0, y: 2 });
  n.units.splice(3, 1);
  b.step(n);
  assert.equal(b.size, 0, 'target dead: goal done');
});

test('attack-move to a cell shoots anything already in range first', () => {
  const b = createBuffer();
  b.push([{ cmd: 'attack', units: [3], x: 3, y: 3 }]);
  const n = tiny(); n.units[3].x = 0; n.units[3].y = 2;
  assert.deepEqual(act(b.step(n), 3), { type: ACT.ATTACK, x: 0, y: 2 });
});

test('production spends the bank once per unit and the count is what stands', () => {
  const b = createBuffer();
  b.push([{ cmd: 'train', building: 2, type: 'Worker', count: 2 }]);
  const n = tiny();
  assert.deepEqual(act(b.step(n), 2), { type: ACT.PRODUCE, parameter: 1, unitType: 'Worker' });   // the free cell nearest the map centre
  assert.equal(b.size, 1, 'one of two still owed');
  b.step(n);
  assert.equal(b.size, 0);
});

test('a busy subject keeps its goal and nothing is issued for it', () => {
  const b = createBuffer();
  b.push([{ cmd: 'move', units: [3], x: 3, y: 1 }]);
  const n = tiny(); n.units[2].busy = true;
  assert.deepEqual(b.step(n), []);
  assert.equal(b.size, 1);
});

test('a new order for the same subject replaces its goal: repeating a standing order is free', () => {
  const b = createBuffer();
  b.push([{ cmd: 'move', units: [3], x: 3, y: 1 }]);
  b.push([{ cmd: 'move', units: [3], x: 0, y: 3 }]);
  assert.equal(b.size, 1);
  assert.deepEqual(act(b.step(tiny()), 3), { type: ACT.MOVE, parameter: 2 });   // DOWN, toward 0,3
});

test('send resolves on the first step: ok when it stands, dead when the unit is gone, wait then stuck on misses', async () => {
  const b = createBuffer({ dropAfter: 3 });
  const ok = b.push([{ cmd: 'move', units: [3], x: 3, y: 1 }]);
  b.step(tiny());
  assert.deepEqual(await ok[0], { ok: true });

  const gone = b.push([{ cmd: 'move', units: [77], x: 3, y: 1 }]);
  b.step(tiny());
  assert.deepEqual(await gone[0], { ok: false, error: 'dead' });

  const broke = createBuffer({ dropAfter: 2 });
  const poor = broke.push([{ cmd: 'train', building: 2, type: 'Worker', count: 1 }]);
  const n = tiny({ res: [0, 5] });
  broke.step(n);
  assert.deepEqual(await poor[0], { ok: false, error: 'wait' }, 'the goal stands, it just could not be stepped');
  assert.equal(broke.size, 1);
  broke.step(n);
  assert.equal(broke.size, 0, 'dropped after dropAfter consecutive misses');
});

test('end() settles everything and refuses later orders', async () => {
  const b = createBuffer();
  const p = b.push([{ cmd: 'move', units: [3], x: 3, y: 1 }]);
  b.end('ended');
  assert.deepEqual(await p[0], { ok: false, error: 'stuck' });
  assert.deepEqual(b.push([{ cmd: 'move', units: [3], x: 3, y: 1 }]), [{ ok: false, error: 'ended' }]);
});

test('only one action per unit per cycle reaches the wire (PlayerAction integrity)', () => {
  const b = createBuffer();
  b.push([{ cmd: 'move', units: [3], x: 3, y: 1 }, { cmd: 'harvest', units: [3], node: 1 }]);
  const out = b.step(tiny());
  assert.equal(out.filter(a => a.unitID === 3).length, 1);
});

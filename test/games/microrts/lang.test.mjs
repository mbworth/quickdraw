import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOne, decode, encodeOrder } from '../../../src/games/microrts/lang.mjs';
import { tool } from '../../../src/games/microrts/tool.mjs';

test('every verb parses', () => {
  assert.deepEqual(parseOne('t 20 wk 3'), { cmd: 'train', building: 20, type: 'Worker', count: 3 });
  assert.deepEqual(parseOne('t 40 li'), { cmd: 'train', building: 40, type: 'Light', count: 1 });
  assert.deepEqual(parseOne('h #22,#25 16'), { cmd: 'harvest', units: ['#22', '#25'], node: 16 });
  assert.deepEqual(parseOne('h idle'), { cmd: 'harvest', units: ['idle'], node: null });
  assert.deepEqual(parseOne('m all 8,8'), { cmd: 'move', units: ['all'], x: 8, y: 8 });
  assert.deepEqual(parseOne('a li 13,13'), { cmd: 'attack', units: ['li'], x: 13, y: 13 });
  assert.deepEqual(parseOne('a #31 #21'), { cmd: 'attack', units: ['#31'], target: 21 });
});

test('a cluster label pasted from the packet survives both splits, with or without its state letter', () => {
  assert.deepEqual(parseOne('m wk x2@1,1 h 8,8'), { cmd: 'move', units: ['wk x2@1,1'], x: 8, y: 8 });
  assert.deepEqual(parseOne('a li x3@6,6 13,13'), { cmd: 'attack', units: ['li x3@6,6'], x: 13, y: 13 });
});

test('count clamps to 1..5; a bad verb or missing argument is one dropped order, never a lost batch', () => {
  assert.equal(parseOne('t 20 wk 99').count, 5);
  assert.equal(parseOne('t 20 wk 0').count, 1);
  for (const s of ['zzz 1', 't 20 zz', 'm all', 'a', 'h']) assert.equal(parseOne(s).cmd, '?', s);
  const d = decode({ o: 't 20 wk; nonsense here; h idle' });
  assert.equal(d.orders.length, 3);
  assert.equal(d.orders[1].cmd, '?');
});

test('decode: "-" and friends are a no-op; tool tags and fences are stripped', () => {
  for (const o of ['-', 'none', 'noop', '', '  ']) assert.deepEqual(decode({ o }), { act: false, orders: [], note: null });
  assert.equal(decode({ o: '```\nt 20 wk\n```</orders>' }).orders.length, 1);
  assert.deepEqual(decode({}), { act: false, orders: [], note: null });
});

test('round trip through encodeOrder', () => {
  for (const c of [{ cmd: 'train', building: 20, type: 'Worker', count: 3 }, { cmd: 'harvest', units: [22], node: 16 }, { cmd: 'move', units: [22, 25], x: 8, y: 8 }, { cmd: 'attack', units: [31], target: 21 }, { cmd: 'attack', units: [31], x: 13, y: 13 }]) {
    const back = parseOne(encodeOrder(c));
    assert.equal(back.cmd, c.cmd, encodeOrder(c));
    if (c.units) assert.deepEqual(back.units, c.units.map(String).map(s => '#' + s));
  }
});

test('the tool is a frozen one-string schema, strict-compatible', () => {
  assert.ok(Object.isFrozen(tool));
  assert.deepEqual(tool.required, ['o']);
  assert.equal(tool.additionalProperties, false);
  assert.equal(tool.properties.o.type, 'string');
});

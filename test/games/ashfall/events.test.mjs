import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTrigger, derive, CLASSES } from '../../../src/games/ashfall/events.mjs';
import { eventKey } from '../../../src/games/ashfall/ctl.mjs';

const S = native => ({ header: {}, native });

test('event kinds map to classes and keys', () => {
  const t = ev => { const x = toTrigger(ev, 0); return [x.cls, x.key, x.urgency]; };
  assert.deepEqual(t({ kind: 'attacked', id: 5, type: 'barracks' }), ['danger', '5', 0]);
  assert.deepEqual(t({ kind: 'attacked', id: 6, type: 'trooper' }), ['danger', '6', 0.5]);
  assert.deepEqual(t({ kind: 'sighted', units: [{ x: -25, z: 31 }] }), ['contact', '-2,1', undefined]);
  assert.deepEqual(t({ kind: 'died', id: 7, team: 0 }), ['loss', '7', undefined]);
  assert.deepEqual(t({ kind: 'died', id: 8, team: 1 }), ['info', '8', undefined]);
  assert.deepEqual(t({ kind: 'idle', id: 9, why: 'field exhausted' }), ['idle', '9', undefined]);
  for (const k of ['built', 'placed', 'trained', 'cancelled']) assert.equal(toTrigger({ kind: k, id: 1 }, 0).cls, 'done');
  assert.deepEqual(t({ kind: 'research', upgrades: {} }), ['done', 'research', undefined]);
  assert.deepEqual(t({ kind: 'bust', team: 1 }), ['economy', 'bust', undefined]);
  for (const k of ['started', 'gameover', 'queued', 'chat']) assert.deepEqual(t({ kind: k }), ['info', k, undefined]);
  assert.ok(CLASSES.every(c => typeof c === 'string'));
});

test('buffer keys collapse repeats by subject', () => {
  assert.equal(eventKey({ kind: 'attacked', id: 3 }), '3');
  assert.equal(eventKey({ kind: 'sighted', units: [{ x: 41, z: -1 }] }), '2,-1');
  assert.equal(eventKey({ kind: 'started' }), '-');
});

test('derive: idle production, purchase lines, supply, low building hp', () => {
  const s = S({ ore: 125, crystal: 40, supply: { used: 9, cap: 10 }, mine: [
    { id: 1, type: 'core', hp: 1300, max: 1300, queue: [] }, { id: 2, type: 'barracks', hp: 300, max: 650, queue: ['trooper'] }, { id: 3, type: 'barracks', hp: 650, max: 650, queue: [], progress: 0.4 },
  ] });
  const d = derive(s).map(x => `${x.cls}:${x.key}`);
  assert.deepEqual(d, ['idle:b1', 'danger:hp2', 'economy:oreworker', 'economy:oretrooper', 'economy:oredepot', 'economy:oreturret', 'economy:orebarracks', 'economy:cry40', 'economy:supply']);
  assert.deepEqual(derive(S({ ore: 10, crystal: 0, supply: { used: 1, cap: 10 }, mine: [] })), []);
});

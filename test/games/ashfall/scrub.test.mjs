import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scrubState, scrubEvent, createIdMap, strayKeys, LEAK } from '../../../src/games/ashfall/scrub.mjs';
import { FIXTURES, fixtureFiles, loadFixture } from './helpers.mjs';

test('scrub renumbers ids, drops name/seed/player/chat, keeps only allowlisted keys', () => {
  const ids = createIdMap();
  const raw = { game: 4242, team: 0, name: 'Amber', seed: 'deadbeefdeadbeef', player: 'p@x', time: 1, ore: 150, crystal: 0, supply: { used: 5, cap: 10 }, upgrades: { weapons: 0, secret: 1 }, started: true, queued: 0, gameOver: false, winner: null, eliminationIn: null, enemyEliminationIn: null, myBase: { x: -70, z: 0, extra: 1 }, mine: [{ id: 9001, type: 'core', x: -70, z: 0, team: 0, elev: 0, hp: 1300, max: 1300, queue: ['worker'], prog: 0.2, seed: 3 }, { id: 9007, type: 'worker', x: -60, z: 1, team: 0, elev: 0, hp: 40, max: 40, state: 'gather', target: 9001 }], enemyVisible: [], enemyBuildingsRemembered: [], fields: [{ x: -57, z: 0, kind: 'my-base', res: 'ore', live: true, seen: true, ore: 1000, nodes: [{ id: 77, amount: 500, seen: true, hidden: 1 }] }] };
  const s = scrubState(raw, ids);
  assert.equal(s.game, 1);
  assert.deepEqual(s.mine.map(e => e.id), [1, 2]);
  assert.equal(s.mine[1].target, 1);
  assert.equal(s.fields[0].nodes[0].id, 1);
  assert.equal(scrubEvent({ seq: 1, t: 2, kind: 'chat', from: 'x', text: 'y' }, ids), null);
  const ev = scrubEvent({ seq: 2, t: 3, kind: 'attacked', id: 9007, type: 'worker', x: 1, z: 2, hp: 0.5, by: { id: 555, type: 'raider', x: 3, z: 4, team: 1 }, secret: 1 }, ids);
  assert.equal(ev.id, 2);
  assert.equal(ev.by.id, 3);
  const fx = { state: s, events: [ev] };
  assert.deepEqual(strayKeys(fx), []);
  assert.doesNotMatch(JSON.stringify(fx), LEAK);
});

test('every committed fixture is allowlisted and leaks nothing', () => {
  for (const f of fixtureFiles()) {
    const fx = loadFixture(f);
    assert.deepEqual(strayKeys(fx), [], f);
    assert.doesNotMatch(fs.readFileSync(path.join(FIXTURES, f), 'utf8'), LEAK, f);
  }
});

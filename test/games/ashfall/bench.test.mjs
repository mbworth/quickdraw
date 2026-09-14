import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strayKeys, LEAK } from '../../../src/games/ashfall/scrub.mjs';
import { loadCases, runBench, summarize } from '../../../bin/bench.mjs';
import { createAdapter, divisor } from '../../../src/games/ashfall/index.mjs';
import { toTrigger } from '../../../src/games/ashfall/events.mjs';
import { virtualClock } from '../../../src/core/clock.mjs';
import { searchField } from '../../../src/games/ashfall/coder.mjs';

const cases = await loadCases('ashfall');
const by = Object.fromEntries(cases.map(c => [c.id, c]));

test('every bench fixture is scrubbed and every case has a rule and a predicate', () => {
  assert.ok(cases.length >= 9);
  for (const c of cases) {
    assert.deepEqual(strayKeys(c.fx), [], c.id);
    assert.ok(!LEAK.test(JSON.stringify(c.fx)), `${c.id}: leak pattern`);
    assert.equal(typeof c.expect, 'function'); assert.ok(c.rule.length > 10);
    assert.equal(c.expect([], c.fx.state), c.id === 'wave', `${c.id}: no orders passes only the hold case`);
  }
});

test('predicates accept the prompt’s order and reject the wrong one', () => {
  const s = id => by[id].fx.state;
  const push = s('push'), m = { x: -push.myBase.x, z: -push.myBase.z };
  const ids = push.mine.filter(e => e.type === 'trooper').map(e => e.id);
  assert.ok(by.push.expect([{ cmd: 'move', units: ids.slice(0, 8), x: m.x, z: m.z, attackMove: true }], push));
  assert.ok(by.push.expect([{ cmd: 'move', units: ['army'], x: m.x, z: m.z, attackMove: true }], push), 'a selector counts the army');
  assert.ok(!by.push.expect([{ cmd: 'move', units: ids.slice(0, 3), x: m.x, z: m.z, attackMove: true }], push), 'a piece is not the ball');
  assert.ok(!by.push.expect([{ cmd: 'move', units: ids, x: push.myBase.x, z: push.myBase.z, attackMove: true }], push), 'toward home is not a push');
  for (const id of ['search', 'search2']) {   // the waypoint M names passes; another far field, the centre, home and a piece do not
    const st = s(id), w = searchField(st).f, ids = st.mine.filter(e => e.type === 'trooper').map(e => e.id);
    assert.ok(by[id].expect([{ cmd: 'move', units: ids, x: Math.round(w.x), z: Math.round(w.z), attackMove: true }], st), `${id}: the waypoint`);
    const other = st.fields.find(f => f.ore == null && f.res !== 'crystal' && Math.hypot(f.x - w.x, f.z - w.z) > 40);
    assert.ok(!by[id].expect([{ cmd: 'move', units: ids, x: Math.round(other.x), z: Math.round(other.z), attackMove: true }], st), `${id}: another far field is not the search`);
    assert.ok(!by[id].expect([{ cmd: 'move', units: ids, x: 0, z: 0, attackMove: true }], st), `${id}: the centre`);
    assert.ok(!by[id].expect([{ cmd: 'move', units: ids, x: Math.round(st.myBase.x), z: Math.round(st.myBase.z), attackMove: true }], st), `${id}: home`);
    assert.ok(!by[id].expect([{ cmd: 'move', units: ids.slice(0, 3), x: Math.round(w.x), z: Math.round(w.z), attackMove: true }], st), `${id}: a piece`);
  }
  assert.ok(!by.push.expect([{ cmd: 'move', units: ids, x: 0, z: 0, attackMove: true }], push), 'the centre is not a push target (game 33)');
  const rep = s('repair'), turret = rep.mine.find(e => e.type === 'turret');
  assert.ok(by.repair.expect([{ cmd: 'repair', units: [1], target: turret.id }], rep)); assert.ok(!by.repair.expect([{ cmd: 'repair', units: [1], target: 1 }], rep));
  const dry = s('dry'), node = dry.fields.find(f => f.ore > 0 && f.nodes.length).nodes[0].id;
  assert.ok(by.dry.expect([{ cmd: 'gather', units: [1], ore: node }], dry)); assert.ok(!by.dry.expect([{ cmd: 'gather', units: [1], ore: null }], dry), 'a blind gather fails');
  const core = s('core'), ec = core.enemyVisible.find(e => e.type === 'core');
  assert.ok(by.core.expect([{ cmd: 'attack', units: ['army'], target: ec.id }], core)); assert.ok(by.core.expect([{ cmd: 'move', units: ['army'], x: ec.x, z: ec.z, attackMove: true }], core));
  const wave = s('wave'), enemy = wave.enemyVisible[0];
  assert.ok(!by.wave.expect([{ cmd: 'move', units: ['army'], x: enemy.x, z: enemy.z, attackMove: true }], wave), 'chasing fails');
  assert.ok(by.wave.expect([{ cmd: 'train', building: 1, type: 'trooper' }, { cmd: 'stop', units: ['army'] }], wave), 'holding passes');
  assert.ok(by.turret.expect([{ cmd: 'build', type: 'turret', workers: [2], x: 0, z: 0 }], s('turret')));
  const rem = s('remembered'), b = rem.enemyBuildingsRemembered[0];
  assert.ok(by.remembered.expect([{ cmd: 'move', units: ['army'], x: b.x, z: b.z, attackMove: true }], rem));
  assert.ok(!by.remembered.expect([{ cmd: 'move', units: ['army'], x: 65, z: 25, attackMove: true }], rem), 'the prompt’s example coordinates are not the base');
  assert.ok(by.remembered.expect([{ cmd: 'move', units: [28, 30, 34, 35, 38, 41, 43], x: b.x, z: b.z, attackMove: true }], rem), 'the seven-man ball counts') && assert.ok(!by.remembered.expect([{ cmd: 'move', units: ['army'], x: -26, z: -53, attackMove: true }], rem), 'home is not a push');
  assert.ok(by.nobarracks.expect([{ cmd: 'build', type: 'barracks', workers: ['workers'], x: 0, z: 0 }], s('nobarracks')) && !by.nobarracks.expect([{ cmd: 'train', type: 'worker' }], s('nobarracks')));
});

test('runBench scores a fake model against every case and summarize counts passes', async () => {
  const clock = virtualClock(0);
  const adapter = createAdapter({}, { clock, open: true, host: 'ws://127.0.0.1:1', WS: class { close() {} } });
  const always = { turret: [{ cmd: 'build', type: 'turret', workers: ['workers'], x: 50, z: 0 }] };
  const callModel = async () => ({ act: true, orders: always.turret, note: null, usage: { output_tokens: 20, input_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 0 }, stop: 'tool_use', latencyMs: 5, cost: 0.001 });
  const rows = await runBench({ adapter, callModel, cases: cases.filter(c => ['turret', 'push', 'wave'].includes(c.id)), repeats: 2, toTrigger, flags: {}, divisor, clock });
  assert.equal(rows.length, 6);
  const s = summarize(rows);
  assert.deepEqual(s.cases, { turret: { pass: 2, n: 2 }, push: { pass: 0, n: 2 }, wave: { pass: 2, n: 2 } });
  assert.equal(s.passRate, 67); assert.equal(s.outP50, 20); assert.equal(s.calls, 6);
});

test('ashfall rules apply on the bench fixtures that embody them and pass on the prompt’s order', async () => {
  const { rules } = await import('./bench/rules.mjs');
  const R = Object.fromEntries(rules.map(r => [r.id, r]));
  const s = id => by[id].fx.state;
  assert.ok(R.turret.when(s('turret'), [], []) && !R.turret.when(s('push'), [], []), 'turret applies before one exists');
  assert.ok(R.turret.pass([{ cmd: 'build', type: 'turret' }], [], s('turret')) && !R.turret.pass([{ cmd: 'build', type: 'depot' }], [], s('turret')));
  const push = s('push'), m = { x: -push.myBase.x, z: -push.myBase.z };
  assert.ok(R.push8.when(push, [], []));
  assert.ok(R.push8.pass([{ cmd: 'move', units: ['army'], x: m.x, z: m.z, attackMove: true }], [], push) && !R.push8.pass([{ cmd: 'train' }], [], push));
  const piece = [{ cmd: 'move', units: [1, 2], x: m.x, z: m.z, attackMove: true }];
  assert.ok(R.wholeBall.when(push, piece, []) && !R.wholeBall.pass(piece, [], push));
  assert.ok(R.repair.when(s('repair'), [], []) && !R.repair.when(push, [], []));
  assert.ok(R.gatherNode.when(s('dry'), [{ cmd: 'gather', ore: null }], []) && !R.gatherNode.pass([{ cmd: 'gather', ore: null }], [], s('dry')));
  assert.ok(R.attackVisible.when(push, [], [{ reason: 'no-target', cmd: {} }]) && !R.attackVisible.pass([], [{ reason: 'no-target', cmd: {} }]));
  assert.ok(R.noChase.when(s('wave'), [], []) && R.noChase.pass([{ cmd: 'stop', units: ['army'] }], [], s('wave')));
  assert.ok(R.depot.when(s('capped'), [], []) && R.depot.pass([{ cmd: 'build', type: 'depot' }], [], s('capped')));
});

test('--drop-layer removes one layer from the packet and skips cases where the control packet would not carry it', async () => {
  const clock = virtualClock(0);
  const adapter = createAdapter({}, { clock, open: true, host: 'ws://127.0.0.1:1', foldFields: true, fieldsOnDemand: true, compactBuildings: true, keepRemembered: true, lang: true });
  const packets = [];
  const callModel = async ({ packet }) => { packets.push(packet); return { act: false, orders: [], note: null, usage: { output_tokens: 3, input_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 0 }, stop: 'tool_use', latencyMs: 1, cost: 0.001 }; };
  const picked = cases.filter(c => ['push', 'dry', 'remembered'].includes(c.id));
  const flags = { slim: true, packetMax: 1000 };
  const army = await runBench({ adapter, callModel, cases: picked, repeats: 1, toTrigger, flags: { ...flags, dropLayer: 'army' }, divisor, clock });
  assert.equal(army.filter(r => r.skipped).length, 0);
  assert.ok(packets.every(p => !/^A\b/m.test(p)), 'no A layer in any packet');
  packets.length = 0;
  const rem = await runBench({ adapter, callModel, cases: picked, repeats: 1, toTrigger, flags: { ...flags, dropLayer: 'remembered' }, divisor, clock });
  assert.deepEqual(rem.filter(r => r.skipped).map(r => r.id), ['push'], 'M none: skipped');
  assert.equal(packets.length, 2);
  const fields = await runBench({ adapter, callModel, cases: picked, repeats: 1, toTrigger, flags: { ...flags, dropLayer: 'fields' }, divisor, clock });
  assert.ok(fields.find(r => r.id === 'push').skipped && !fields.find(r => r.id === 'dry').skipped, 'fields are on the slim cadence except on demand');
  const s = summarize(rem);
  assert.equal(s.calls, 2); assert.equal(s.cases.push.n, 0);
});

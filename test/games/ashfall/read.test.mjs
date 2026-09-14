import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { read, ReadError } from '../../../src/games/ashfall/read.mjs';
import { encode, post, yard } from '../../../src/games/ashfall/coder.mjs';
import { assemble } from '../../../src/core/packet.mjs';
import { readRun } from '../../../src/core/record.mjs';
import { loadCases } from '../../../bin/bench.mjs';
import { HERE, fixtureFiles, layersAt } from './helpers.mjs';

const ROOT = path.resolve(HERE, '../../..');
const WORKING = { foldFields: true, fieldsOnDemand: true, compactBuildings: true, keepRemembered: true, searchFields: true, guide: true };
const R = Math.round;
const cases = await loadCases('ashfall');
const snap = fx => ({ header: { lifecycle: 'active', clocks: { game: fx.state.time } }, native: fx.state, t: 0, idx: 1 });

test('the working-config packet of every bench fixture reads back to the state it came from', () => {
  for (const c of cases) {
    const s = c.fx.state, state = snap(c.fx);
    const pkt = assemble(encode({ state, prevDecisionState: null, triggers: [{ cls: 'heartbeat', key: 'hb', t: 0 }], lastOrders: [] }, WORKING), { maxTokens: 1000, divisor: 3.5, fullEvery: 5, n: 2 });
    const k = read(pkt.text);
    const mine = s.mine.filter(e => e.progress === undefined || !['core', 'barracks', 'depot', 'turret', 'wall', 'armory', 'sensor'].includes(e.type));
    assert.equal(k.h.o, R(s.ore), c.id); assert.equal(k.h.wk, s.mine.filter(e => e.type === 'worker').length, c.id); assert.equal(k.h.tr, s.mine.filter(e => e.type === 'trooper').length, c.id);
    assert.equal(k.h.capped, s.supply.used >= s.supply.cap, c.id);
    const core = k.b.list.find(b => b.type === 'co'), sc = s.mine.find(e => e.type === 'core');
    assert.deepEqual({ x: core.x, z: core.z }, { x: R(sc.x), z: R(sc.z) }, `${c.id}: home`);
    assert.deepEqual(k.b.post, { x: R(post(s).x), z: R(post(s).z) }, `${c.id}: post`); assert.deepEqual(k.b.yard, { x: R(yard(s).x), z: R(yard(s).z) }, `${c.id}: yard`);
    assert.equal(k.b.noTu, !s.mine.some(e => e.type === 'turret'), `${c.id}: (no tu)`);
    assert.equal(k.b.list.length, s.mine.filter(e => ['core', 'barracks', 'depot', 'turret', 'wall', 'armory', 'sensor'].includes(e.type)).length, `${c.id}: buildings`);
    assert.equal(k.a.reduce((n, cl) => n + cl.n, 0), mine.filter(e => !['core', 'barracks', 'depot', 'turret', 'wall', 'armory', 'sensor'].includes(e.type)).length, `${c.id}: army count`);
    for (const cl of k.a) assert.equal(cl.out, cl.type !== 'wk' && Math.hypot(cl.x - s.myBase.x, cl.z - s.myBase.z) > 30, `${c.id}: out mark on ${cl.label}`);
    assert.equal(k.x.reduce((n, cl) => n + cl.n, 0), (s.enemyVisible || []).length, `${c.id}: enemy count`);
    assert.equal(k.m.buildings.length, (s.enemyBuildingsRemembered || []).length, `${c.id}: remembered`);
    if (k.layers.has('F')) assert.equal(k.f.fields.length + k.f.unexplored.length, s.fields.length, `${c.id}: fields`);
    assert.equal(k.p.filter(b => b.type === 'ba' && b.done).length, s.mine.filter(e => e.type === 'barracks' && e.progress === undefined).length, `${c.id}: barracks in P`);
  }
});

test('every layer shape the encoder writes reads: full buildings, deltas, triggers, last orders, remembered, folded fields', () => {
  const files = fixtureFiles();
  for (let i = 0; i < files.length; i++) {
    for (const opts of [{}, WORKING, { ...WORKING, planMarks: true }, { ...WORKING, compactBuildings: false }, { fullBuildings: true, keepAnchor: true }]) {
      for (const n of [1, 2]) {
        const pkt = assemble(layersAt(i, files, opts), { maxTokens: 1000, divisor: 3.5, fullEvery: 5, n });
        const k = read(pkt.text);
        assert.ok(k.h && k.b.list.some(b => b.type === 'co'), `${files[i]} n=${n}`);
      }
    }
  }
  for (const g of ['opening', 'firefight', 'late']) assert.ok(read(fs.readFileSync(path.join(HERE, 'golden', `${g}.txt`), 'utf8')).h);
});

test('facts the policy reads: kill, sup cap, idle harvesters, dug, out, search, nospot, pending', () => {
  const k = read(['H t3:59 o730 c0 s18/18 CAPPED wk9 tr12', 'D +tr#55 -tr#24 E-tr x1 o-70', 'T dmg tr#24 hp0 by tr x2; seen wk@-23,-3; lost tr#24 by tr; kill tr#51; sup cap; idle wk#7 dry',
    'P co#1 q0 IDLE; ba#13 q2 tr 0 r58,4 out failed; ba#40 bld 60', 'E f1 ore wk4 o0; idle wk #9,#11', 'A', 'tr x4@-10,-1 a out', 'tr x2@3,-2 i #23,#32', 'wk x4@55,2 g',
    'B co#1@70,4 hp97 post@62,3 yard@82,5 ba#13 dp#22 bld20 tu#30@62,3 hp58 (2nd ba)', 'X', 'tr x12@-39,-33 d106/8 dug', 'co x1@-70,-4 d140/30 #20001', 'M', 'ba#12@22,49 hp80 age12', 'search @-70,-4', 'F',
    'f1 home ore@61,13 o1285 live n#1,#2', 'f3 exp ore@-5,-34 ?', 'f? f6@-42,7 f11c@13,-17', 'L build dp 82,5 nospot; train tr #13 ok; pending: seen tr@45,22'].join('\n'));
  assert.deepEqual([k.h.capped, k.h.sUsed, k.h.sCap, k.h.wk, k.h.tr], [true, 18, 18, 9, 12]);
  assert.ok(k.d.enemyGone && k.t.kill && k.t.supCap); assert.deepEqual(k.t.idleWk, [7]); assert.deepEqual(k.e.idleWk, [9, 11]); assert.equal(k.e.fields[0].o, 0);
  assert.deepEqual(k.p.map(b => [b.id, b.done, b.q, b.out, b.rally && b.rally.x]), [[1, true, 0, false, null], [13, true, 2, true, 58], [40, false, null, false, null]]);
  assert.deepEqual(k.a.map(c => [c.label, c.state, c.out, c.ids]), [['tr x4@-10,-1', 'a', true, []], ['tr x2@3,-2', 'i', false, [23, 32]], ['wk x4@55,2', 'g', false, []]]);
  assert.deepEqual(k.b.list.map(b => [b.type, b.id, b.hp, b.bld]), [['co', 1, 97, null], ['ba', 13, 100, null], ['dp', 22, 100, 20], ['tu', 30, 58, null]]);
  assert.deepEqual([k.b.post, k.b.yard, k.b.noTu, k.b.secondBa, k.p[1].failed], [{ x: 62, z: 3 }, { x: 82, z: 5 }, false, true, true]);
  assert.deepEqual(k.x.map(c => [c.type, c.n, c.dB, c.dA, c.dug, c.ids]), [['tr', 12, 106, 8, true, []], ['co', 1, 140, 30, false, [20001]]]);
  assert.deepEqual([k.m.buildings[0].id, k.m.search], [12, { field: null, x: -70, z: -4 }]);
  assert.deepEqual([k.f.fields[0].nodes, k.f.unexplored.map(f => f.i)], [[1, 2], [3, 6, 11]]);
  assert.deepEqual([k.l.nospot[0].type, k.l.pending], ['dp', 'seen tr@45,22']);
});

test('an unknown token in a structured layer throws ReadError; the event layers classify anything', () => {
  assert.throws(() => read('H t0:00 o150 c0 s4/10 zz9\nB co#1@70,4'), ReadError);
  assert.throws(() => read('H t0:00 o150 c0 s4/10\nB co#1@70,4 frobnicate'), ReadError);
  assert.throws(() => read('H t0:00 o150 c0 s4/10\nA\ntr five@1,2 i'), ReadError);
  assert.throws(() => read('B co#1@70,4'), ReadError, 'no header');
  const k = read('H t0:00 o150 c0 s4/10\nD frob#1\nT started; frob 3\nB co#1@70,4\nL frob 1 2 ok');
  assert.deepEqual(k.t.items.map(i => i.kind), ['started', 'frob']);
});

test('every packet of every local recording reads (skipped without runs/)', { skip: !fs.existsSync(path.join(ROOT, 'runs')) }, () => {
  const files = fs.readdirSync(path.join(ROOT, 'runs')).filter(f => /^ashfall-\d+\.jsonl$/.test(f));
  let n = 0;
  for (const f of files) for (const r of readRun(path.join(ROOT, 'runs', f))) if (r.kind === 'call' && r.packet) { read(r.packet); n++; }
  assert.ok(files.length === 0 || n > 0);
});

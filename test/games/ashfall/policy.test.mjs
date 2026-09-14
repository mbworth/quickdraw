// The scripted game38 policy: every bench case passes (the strategy as code, deterministic, free), the prompt's words map to the
// packet, and the harness seam carries it like a model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, runBench, summarize } from '../../../bin/bench.mjs';
import { modelFor } from '../../../bin/_boot.mjs';
import { createAdapter, divisor } from '../../../src/games/ashfall/index.mjs';
import { toTrigger } from '../../../src/games/ashfall/events.mjs';
import { virtualClock } from '../../../src/core/clock.mjs';
import { decide } from '../../../src/games/ashfall/policy/game38.mjs';
import { ReadError } from '../../../src/games/ashfall/read.mjs';

const WORKING = { foldFields: true, fieldsOnDemand: true, noNote: true, compactBuildings: true, keepRemembered: true, lang: true, searchFields: true, guide: true };
const clock = virtualClock();
const adapter = createAdapter({}, { ...WORKING, clock, open: true, host: 'ws://127.0.0.1:1' });
const cases = await loadCases('ashfall');
const flags = { slim: true, packetMax: 1000 };

test('the script passes every bench case on the working config', async () => {
  const callModel = await modelFor({ adapter, game: 'ashfall', model: 'script:game38', clock });
  const rows = await runBench({ adapter, callModel, cases, repeats: 1, toTrigger, flags, divisor, clock });
  const s = summarize(rows);
  assert.deepEqual(rows.filter(r => !r.pass).map(r => r.id), [], JSON.stringify(s.cases));
  assert.equal(s.passRate, 100); assert.equal(s.cost, 0);
});

const pkt = (over = {}) => {
  const L = { H: 'H t2:00 o150 c0 s12/18 wk6 tr8', D: 'D none', T: 'T none', P: 'P co#1 q0 IDLE; ba#13 q1 tr 40 r62,3', E: 'E f1 ore wk3 o2000; f2 ore wk3 o2000', A: 'A\nwk x6@63,10 g\ntr x8@62,3 i', B: 'B co#1@70,4 post@62,3 yard@82,5 ba#13 tu#30@62,3', X: 'X none', M: 'M none', L: 'L none', ...over };
  return ['H', 'D', 'T', 'P', 'E', 'A', 'B', 'X', 'M', 'F', 'L'].map(k => L[k]).filter(Boolean).join('\n');
};
const o = s => decide(s).o;

test('the ladders, line by line', () => {
  assert.equal(o(pkt({ B: 'B co#1@70,4 post@62,3 yard@82,5 (no tu)', P: 'P co#1 q0 IDLE', H: 'H t0:00 o150 c0 s4/10 wk4 tr0', A: 'A\nwk x4@63,4 g' })), 'b ba 82,5', 'Buy 2 before any harvester');
  assert.equal(o(pkt({ B: 'B co#1@70,4 post@62,3 yard@82,5 (no tu)', P: 'P co#1 q0 IDLE', H: 'H t0:05 o100 c0 s4/10 wk4 tr0', A: 'A\nwk x4@63,4 g' })), '-', 'Buy 2: until placed, nothing else');
  assert.equal(o(pkt({ H: 'H t2:00 o150 c0 s17/18 wk6 tr8' })), 'b dp 82,5; t 13 tr 2'.split(';')[0], 'Buy 1 first: supply within 2 of cap');
  assert.equal(o(pkt({ H: 'H t2:00 o60 c0 s17/18 wk6 tr8' })), 't 13 tr 2', 'Buy 1 unaffordable → the next affordable line');
  assert.equal(o(pkt({ H: 'H t2:00 o150 c0 s18/18 CAPPED wk6 tr8', B: 'B co#1@70,4 post@62,3 yard@82,5 ba#13 dp#22 bld20 tu#30@62,3' })), '-', 'CAPPED with a depot building: no units');
  assert.equal(o(pkt({ H: 'H t2:00 o150 c0 s12/18 wk5 tr8' })), 't 1 wk 1', 'Buy 3');
  assert.equal(o(pkt()), 't 13 tr 2', 'Buy 4');
  assert.equal(o(pkt({ H: 'H t2:00 o250 c0 s12/18 wk6 tr8', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), 'b ba 82,5', 'Buy 5: second barracks');
  assert.equal(o(pkt({ H: 'H t2:00 o250 c0 s12/18 wk6 tr8', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3; ba#14 q3 tr 10 r62,3', B: 'B co#1@70,4 post@62,3 yard@82,5 ba#13 ba#14 tu#30@62,3' })), 't 1 wk 1', 'Buy 6, never a third barracks');
  assert.equal(o(pkt({ H: 'H t2:00 o250 c0 s12/18 wk12 tr8', P: 'P co#1 q0 IDLE; ba#13 q4 tr 40 r62,3; ba#14 q3 tr 10 r62,3', B: 'B co#1@70,4 post@62,3 yard@82,5 ba#13 ba#14 tu#30@62,3' })), 't 14 tr 2', 'Buy 7: the shortest queue');
  assert.equal(o(pkt({ L: 'L build dp 82,5 nospot', H: 'H t2:00 o150 c0 s17/18 wk6 tr8' })), 'b dp 62,3', 'Keep: nospot → the post');
  // Army
  assert.equal(o(pkt({ X: 'X\nco x1@-70,-4 d140/3 #20001', A: 'A\ntr x8@-65,-2 i out', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r-70,-4 out', H: 'H t6:00 o40 c0 s12/18 wk6 tr8' })), 'a troopers 20001', 'Army 3');
  assert.equal(o(pkt({ X: 'X\ntr x12@-39,-33 d106/8 dug', A: 'A\ntr x8@-36,-27 i out', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r-60,-36 out', H: 'H t6:00 o40 c0 s12/18 wk6 tr8' })), 'am tr x8@-36,-27 62,3; ry 13 62,3', 'Army 1: dug in and as big → home, attack off');
  assert.equal(o(pkt({ M: 'M\nsearch @-70,-4', A: 'A\ntr x8@-30,-10 i out\ntr x2@62,3 i', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r-70,-4 out', H: 'H t6:00 o40 c0 s12/18 wk6 tr10' })), 'am tr x8@-30,-10,tr x2@62,3 -70,-4', 'Army 4: rally out → idle clusters at the target');
  assert.equal(o(pkt({ A: 'A\ntr x3@-30,-10 a out', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r-70,-4 out', H: 'H t6:00 o40 c0 s12/18 wk6 tr3' })), 'ry 13 62,3; am troopers 62,3', 'Army 4: under 5 → failed, home');
  assert.equal(o(pkt({ A: 'A\ntr x7@30,-10 i out\ntr x1@62,3 i', H: 'H t6:00 o40 c0 s12/18 wk6 tr8', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), 'am tr x7@30,-10 62,3', 'Army 5: alone in the open → home');
  assert.equal(o(pkt({ X: 'X\ntr x3@58,10 d9/7', H: 'H t3:00 o40 c0 s12/18 wk6 tr8', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), 'am tr x8@62,3 58,10', 'Army 6: outnumber the raid → meet it');
  assert.equal(o(pkt({ X: 'X\ntr x9@58,10 d9/7', H: 'H t3:00 o40 c0 s12/18 wk6 tr8', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), '-', 'Army 6: outnumbered → hold');
  assert.equal(o(pkt({ T: 'T kill tr#40', M: 'M\nsearch @-70,-4', A: 'A\ntr x16@62,3 i', H: 'H t4:00 o40 c0 s12/18 wk6 tr16', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), 'am troopers -70,-4; ry 13 -70,-4', 'Army 7: the commit on a kill packet');
  assert.equal(o(pkt({ M: 'M\nsearch @-70,-4', A: 'A\ntr x16@62,3 i', H: 'H t4:00 o40 c0 s12/18 wk6 tr16', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), '-', 'Army 7: a quiet packet never commits');
  assert.equal(o(pkt({ T: 'T kill tr#40', M: 'M\nsearch @-70,-4', A: 'A\ntr x12@62,3 i', H: 'H t4:00 o40 c0 s12/18 wk6 tr12', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), '-', 'Army 7: under 15 never leaves');
  // Keep
  assert.equal(o(pkt({ P: 'P co#1 q0 IDLE; ba#13 q3 tr 40', H: 'H t2:00 o40 c0 s12/18 wk6 tr8' })), 'ry 13 62,3', 'Keep: a barracks with no rally');
  assert.equal(o(pkt({ B: 'B co#1@70,4 post@62,3 yard@82,5 ba#13 (no tu)', H: 'H t2:00 o170 c0 s12/18 wk6 tr8', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), 't 1 wk 1; b tu 62,3', 'Keep: the turret once 6 riflemen stand and the bank covers it after the buy (Buy 6 first)');
  assert.equal(o(pkt({ B: 'B co#1@70,4 post@62,3 yard@82,5 ba#13 tu#30@62,3 hp40', H: 'H t2:00 o40 c0 s12/18 wk6 tr8', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), 'r idle 30', 'Keep: repair a hurt turret');
  assert.equal(o(pkt({ E: 'E f1 ore wk3 o0; idle wk #9', H: 'H t2:00 o40 c0 s12/18 wk6 tr8', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3', F: 'F\nf1 home ore@61,13 o0 live n#1\nf2 home ore@62,-6 o1200 live n#6,#7\nf6 exp ore@38,-19 o5500 n#11', X: 'X\ntr x3@40,-15 d30/30' })), 'g idle 6', 'Keep: gather at the richest field with no enemy near');
  assert.equal(o(pkt({ E: 'E idle wk #9', H: 'H t2:00 o40 c0 s12/18 wk6 tr8', P: 'P co#1 q0 IDLE; ba#13 q3 tr 40 r62,3' })), 'g idle', 'Keep: no F → g idle alone');
});

test('the prompt\'s words need the guide fields: no post/yard is a read error, not a guess', () => {
  assert.throws(() => decide(pkt({ B: 'B co#1@70,4 ba#13 tu#30@62,3' })), ReadError);
  assert.throws(() => decide(pkt({ B: 'B none' })), ReadError);
});

test('the seam: a script model decodes like a tool call, carries why in note, and reports a packet it cannot read', async () => {
  const callModel = await modelFor({ adapter, game: 'ashfall', model: 'script:game38', clock });
  const r = await callModel({ packet: pkt() });
  assert.deepEqual([r.act, r.stop, r.cost, r.note, r.orders[0].cmd], [true, 'tool_use', 0, 'buy4 army8', 'train']);
  const bad = await callModel({ packet: 'H t0:00 o1 c0 s1/1\nB none' });
  assert.deepEqual([bad.act, bad.stop], [false, 'error:read']);
  await assert.rejects(modelFor({ adapter, game: 'ashfall', model: 'script:../x', clock }), /bad policy name/);
});

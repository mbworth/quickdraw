// The commander split: apply() clamps a tool answer into params, and rush.mjs plays from those params.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../../../src/games/microrts/coder.mjs';
import { read } from '../../../src/games/microrts/read.mjs';
import { decide, decideFacts, DEFAULTS } from '../../../src/games/microrts/policy/rush.mjs';
import { defaults, apply, tool, measure, METRICS } from '../../../src/games/microrts/policy/commander.mjs';
import { assemble } from '../../../src/core/packet.mjs';
import { tinySnap } from './helpers.mjs';

test('defaults mirrors rush.DEFAULTS with target:null', () => {
  assert.deepEqual(defaults, { ...DEFAULTS, target: null });
});

test('apply clamps in-range fields and falls back on bad ones', () => {
  const prev = { ...defaults, harvesters: 1, defend: 8, panic: 4, target: { x: 3, y: 4 } };
  const p = apply({ harvesters: 5, workers: 99, barracksAt: 3, defend: 10, panic: 20, pushLight: 4, pushWorkers: 7, post: 2, target: '9,9' }, prev);
  assert.equal(p.harvesters, 5);
  assert.equal(p.workers, 12);   // 99 clamped to the 1-12 range
  assert.equal(p.defend, 10);
  assert.equal(p.panic, 10);     // clamped to the new defend, not the raw 20
  assert.deepEqual(p.target, { x: 9, y: 9 });
});

test('apply falls back to prev on missing/malformed fields; null target clears it', () => {
  const prev = { ...defaults, target: { x: 1, y: 1 } };
  const p = apply({}, prev);
  assert.deepEqual(p, prev);
  assert.equal(apply({ target: 'nope' }, prev).target, prev.target);
  assert.equal(apply({ target: '20,3' }, prev).target, prev.target);   // out of 0-15
  assert.equal(apply({ target: null }, prev).target, null);
  assert.equal(apply({ harvesters: 3.5 }, prev).harvesters, prev.harvesters);
});

test('apply normalizes train; garbage falls back to prev', () => {
  const prev = { ...defaults, train: 'li' };
  assert.equal(apply({ train: 'hv, rg' }, prev).train, 'hv,rg');
  assert.equal(apply({ train: 'li,wat,hv' }, prev).train, 'li,hv');
  assert.equal(apply({ train: 'wat' }, prev).train, prev.train);
  assert.equal(apply({ train: '' }, prev).train, prev.train);
  assert.equal(apply({ train: 7 }, prev).train, prev.train);
  assert.equal(apply({}, prev).train, prev.train);
});

test('tool schema requires train', () => {
  assert.ok(tool.required.includes('train'));
  assert.equal(tool.properties.train.type, 'string');
});

// A packet with three idle workers and one node: harvesters:3 tops all three up (barracksAt 4 so no worker builds), the default tops up only two.
test('decide with harvesters:3 produces three harvest orders where the default produces two', () => {
  const W = (id, x, y) => ({ id, type: 'Worker', player: 0, x, y, hp: 1, carry: 0, busy: false, st: 'idle', eta: 0, idleFor: 0 });
  const inp = { state: tinySnap({ units: [
    { id: 1, type: 'Resource', player: -1, x: 0, y: 0, hp: 1, carry: 25, busy: false, st: 'idle', eta: 0, idleFor: 0 },
    { id: 2, type: 'Base', player: 0, x: 5, y: 5, hp: 10, busy: false, st: 'idle', eta: 0, idleFor: 0, carry: 0 },
    W(3, 4, 5), W(5, 6, 5), W(7, 5, 4),
    { id: 4, type: 'Worker', player: 1, x: 15, y: 15, hp: 1, carry: 0, busy: false, st: 'idle', eta: 0, idleFor: 0 },
  ] }), prevDecisionState: null, triggers: [], lastOrders: [], pending: [] };
  const text = assemble(encode(inp), { maxTokens: 400, divisor: 3.5 }).text;
  const count = o => (o.match(/^h /) ? o.split('; ').filter(c => c.startsWith('h ')).length : 0);
  assert.equal(count(decide(text).o), 2);
  assert.equal(count(decide(text, { ...DEFAULTS, harvesters: 3, barracksAt: 4 }).o), 3);
  assert.deepEqual(decide(text, { ...DEFAULTS, harvesters: 3 }), decideFacts(read(text), { ...DEFAULTS, harvesters: 3 }));
});

// target overrides the push destination: three Light and their base gone from range of any raid, so rule 6 fires.
test('target overrides the push destination when the push condition holds', () => {
  const k = {
    h: { r: 0 }, p: [], e: [],
    a: [{ type: 'li', n: 3, x: 5, y: 5, state: 'i', ids: [1, 2, 3], label: 'li x3@5,5' }],
    b: [{ type: 'ba', id: 20, x: 5, y: 5, hp: 10 }],
    x: [{ type: 'ba', n: 1, x: 10, y: 10, dB: null, dA: null, ids: [], label: 'ba x1@10,10' }],
  };
  assert.equal(decideFacts(k).o, 'a #1,#2,#3 10,10');
  assert.equal(decideFacts(k, { ...DEFAULTS, target: { x: 1, y: 14 } }).o, 'a #1,#2,#3 1,14');
});

// measure(): what `expect` is graded on, read off a real packet (runs/microrts-...-CoacAI-mu5fmewr.jsonl, t249).
const PACKET = `H t249 r2 u5/2
D +br#30 r-4
T done br#30; IDLE #30; r li; r rg
P ba#20 wk 36; br#30 IDLE
E
rs#16@0,0 o23 d4
rs#17@0,1 o20 d3
A
wk x2@2,1 h #22,#25
wk x1@2,3 i #26
hv x2@3,3 a #28,#31
B ba#20@2,2 hp7 br#30@1,3 hp4
X
ba x1@13,13 d22/20 #21
wk x2@14,14 d24/22 #23,#24
rg x3@13,15 d24/22 #27,#32,#33
N none`;

test('measure reads every metric off a packet', () => {
  const m = measure(PACKET);
  assert.deepEqual(m, { cycle: 249, bank: 2, base_hp: 7, br: 1, foe_br: 0, wk: 3, foe_wk: 2, li: 0, foe_li: 0, hv: 2, foe_hv: 0, rg: 0, foe_rg: 3, army: 2 });
  assert.deepEqual(Object.keys(m).slice(1).sort(), [...METRICS].sort());
  assert.deepEqual(measure(read(PACKET)), m);   // facts or text, same numbers
});

test('the expect field is optional, typed, and its metric enum is METRICS', () => {
  const e = tool.properties.expect;
  assert.deepEqual(e.type, ['object', 'null']);
  assert.ok(tool.required.includes('expect') && tool.required.includes('plan'));
  assert.deepEqual(e.properties.metric.enum, METRICS);
  assert.deepEqual(e.required, ['metric', 'op', 'value', 'by']);
  assert.equal(e.additionalProperties, false);
  assert.deepEqual(e.properties.op.enum, ['>=', '<=', '==']);
  assert.equal(METRICS.includes('ore'), false);   // a metric measure() cannot produce is not offerable
});

test('plan and expect are not reflex params: apply drops them', () => {
  const p = apply({ plan: 'mass heavies', expect: { metric: 'hv', op: '>=', value: 3, by: 1300 } }, defaults);
  assert.deepEqual(p, defaults);
});

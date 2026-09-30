import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTracker, stepReason, commanderModel } from '../../src/core/commander.mjs';
import { virtualClock } from '../../src/core/clock.mjs';

// packet "cycle army foe_br"
const measure = p => { const m = /^(\d+) (\d+) (\d+)$/.exec(p); if (!m) throw new Error('unmeasurable'); return { cycle: +m[1], army: +m[2], foe_br: +m[3] }; };
const u = (metric, op, value, by) => ({ metric, op, value, by });
const THREE = [{ do: 'hold post, guard 1', until: u('army', '>=', 3, 800) }, { do: 'mass li to 5', until: u('army', '>=', 5, 1050) }, { do: 'push their base', until: u('foe_br', '==', 0, 1500) }];

test('planTracker: S none, then the S block exactly', () => {
  const t = planTracker(measure);
  assert.equal(t.read(), 'S none');
  assert.equal(t.current(), null);
  assert.equal(t.verdict(), null);
  t.see('54 0 1');
  t.set([{ do: 'kill br', until: u('foe_br', '==', 0, 500) }], '  first  ');
  assert.equal(t.read(), 'S plan 1 set t54; kept 0 calls; why: first\nS1 now since t54: kill br | foe_br==0 by t500: pending');
  t.see('300 1 1');
  t.set([{ do: 'kill br again', until: u('foe_br', '==', 0, 900) }], null);
  t.see('699 2 1');
  t.set(THREE, 'lost li to hv');
  for (let i = 0; i < 4; i++) t.set(null, null);
  t.see('754 3 1'); t.see('814 3 1');
  assert.equal(t.read(), [
    'S plan 3 set t699; kept 4 calls; replaced 2x, last why: lost li to hv',
    'S1 done t754: hold post, guard 1 | army>=3 by t800: MET t754',
    'S2 now since t754: mass li to 5 | army>=5 by t1050: pending (max 3, t754)',
    'S3 next: push their base | foe_br==0 by t1500',
  ].join('\n'));
  assert.deepEqual(t.current(), { metric: 'army', op: '>=', value: 5, by: 1050, since: 754 });
});

test('planTracker: null and invalid steps keep the plan; kept is a no-op with no plan; do and why are cut to 80', () => {
  const t = planTracker(measure);
  t.set(null); t.set([]);
  assert.equal(t.read(), 'S none');
  t.see('10 0 1');
  t.set([{ do: 'x'.repeat(100), until: u('army', '>=', 2, 90) }], 'y'.repeat(100));
  for (const bad of [null, [], [{ do: 'a' }], [{ do: 'a', until: u('army', '>', 1, 5) }], [{ until: u('army', '>=', 1, 5) }], Array(5).fill(THREE[0]), 'go']) t.set(bad, 'ignored');
  const s = t.read();
  assert.match(s, /^S plan 1 set t10; kept 7 calls; why: y{80}\nS1 now since t10: x{80} \|/);
});

test('planTracker: steps advance; a packet meeting several cascades; all done lands in the header', () => {
  const t = planTracker(measure);
  t.see('100 0 1');
  t.set(THREE, 'go');
  t.see('200 2 1');
  assert.deepEqual(t.verdict(), { plan: 1, step: 1, verdict: 'pending' });
  t.see('300 5 1');   // step 1 and 2 at once
  assert.match(t.read(), /\nS1 done t300: .*MET t300\nS2 done t300: .*MET t300\nS3 now since t300: push their base \| foe_br==0 by t1500: pending \(last 1, t300\)$/);
  assert.deepEqual(t.verdict(), { plan: 1, step: 2, verdict: 'met' });
  t.see('400 5 0');
  assert.equal(t.read().split('\n')[0], 'S plan 1 set t100; kept 0 calls; why: go; all steps done t400');
  assert.equal(t.current(), null);
  assert.deepEqual(t.verdict(), { plan: 1, step: 3, verdict: 'done' });
});

test('planTracker: past by without holding reads MISSED and the step stays now', () => {
  const t = planTracker(measure);
  t.see('100 0 1');
  t.set(THREE.slice(0, 2), null);
  t.see('500 2 1'); t.see('801 1 1');
  assert.equal(t.read(), 'S plan 1 set t100; kept 0 calls\nS1 now since t100: hold post, guard 1 | army>=3 by t800: MISSED (max 2)\nS2 next: mass li to 5 | army>=5 by t1050');
  assert.deepEqual(t.verdict(), { plan: 1, step: 1, verdict: 'missed' });
  t.see('900 3 1');   // late, still done
  assert.match(t.read(), /\nS1 done t900: .*MET t900\nS2 now since t900: .*pending \(max 3, t900\)$/);
});

test('planTracker: step 1 with the replaced now step\'s metric/op carries best, since, moved and values; a different one starts fresh', () => {
  const t = planTracker(measure);
  t.see('100 0 1');
  t.set([{ do: 'a', until: u('army', '>=', 3, 800) }], 'w1');
  t.see('200 2 1');
  t.see('250 1 1');
  t.set([{ do: 'b', until: u('army', '>=', 4, 900) }, { do: 'c', until: u('foe_br', '==', 0, 1500) }], 'w2');
  t.set([{ do: 'b2', until: u('army', '>=', 4, 1000) }], 'w3');
  assert.equal(t.read(), 'S plan 3 set t250; kept 0 calls; replaced 2x, last why: w3\nS1 now since t250: b2 | army>=4 by t1000: pending; same claim since t100, by moved 2x, value 3>4');
  assert.deepEqual(t.current(), { metric: 'army', op: '>=', value: 4, by: 1000, since: 100 });
  t.set([{ do: 'd', until: u('army', '<=', 1, 1000) }], null);
  assert.equal(t.read().split('\n')[1], 'S1 now since t250: d | army<=1 by t1000: pending');
});

test('planTracker: a changed value keeps the history but grades only from the set cycle on', () => {
  const t = planTracker(measure);
  t.see('100 0 1');
  t.set([{ do: 'a', until: u('army', '>=', 5, 800) }], null);
  t.see('200 4 1');
  t.see('250 2 1');
  t.set([{ do: 'a', until: u('army', '>=', 3, 800) }, { do: 'b', until: u('foe_br', '==', 0, 900) }], null);
  const before = t.read();
  assert.equal(before, 'S plan 2 set t250; kept 0 calls; replaced 1x\nS1 now since t250: a | army>=3 by t800: pending; same claim since t100, value 5>3\nS2 next: b | foe_br==0 by t900');
  t.see('300 3 1');
  const after = t.read();
  assert.equal(after, 'S plan 2 set t250; kept 0 calls; replaced 1x\nS1 done t300: a | army>=3 by t800: MET t300; same claim since t100, value 5>3\nS2 now since t300: b | foe_br==0 by t900: pending (last 1, t300)');
});

test('stepReason: only a change to MET, MISSED or done', () => {
  const p = (plan, step, verdict) => ({ plan, step, verdict });
  assert.equal(stepReason(null, null), null);
  assert.equal(stepReason(null, p(1, 1, 'pending')), null);
  assert.equal(stepReason(p(1, 1, 'pending'), p(1, 1, 'met')), 'step 1 MET');
  assert.equal(stepReason(p(1, 1, 'met'), p(1, 1, 'met')), null);
  assert.equal(stepReason(p(1, 1, 'met'), p(1, 2, 'missed')), 'step 2 MISSED');
  assert.equal(stepReason(p(1, 2, 'met'), p(1, 3, 'done')), 'plan done');
  assert.equal(stepReason(p(1, 1, 'met'), p(2, 1, 'met')), 'step 1 MET');
});

const answer = input => ({ act: false, orders: [], note: null, usage: null, stop: 'tool_use', latencyMs: 5, cost: 0, raw: { content: [{ type: 'tool_use', name: 'plan', input }] } });
function fake() {
  const calls = [];
  const fn = async ({ packet, signal }) => { const c = { packet }; c.done = new Promise(r => (c.resolve = r)); signal?.addEventListener('abort', () => c.resolve({ stop: 'aborted', usage: null, cost: 0 }), { once: true }); calls.push(c); return c.done; };
  return { fn, calls };
}
const mkS = (over = {}) => {
  const clock = virtualClock(), { fn, calls } = fake();
  const observe = { see() {}, read: (_, { expect }) => `O reach: ${expect ? expect.metric : 'none'}`, events: () => [] };
  const callModel = commanderModel({ reflex: (_, p) => ({ o: `m${p.push}`, why: [] }), decode: ({ o }) => ({ act: true, orders: [{ cmd: o }] }), commander: fn, params: { push: 1 }, apply: (i, prev) => ({ push: Number.isFinite(i.push) ? i.push : prev.push }), measure, observe, steps: true, clock, ...over });
  return { callModel, clock, calls };
};

test('commanderModel steps: S rides between F and O, F carries no plan/expect, the answer sets the plan and summary.plan holds S', async () => {
  const { callModel, clock, calls } = mkS();
  await callModel({ packet: '100 0 1' });
  assert.equal(calls[0].packet, '100 0 1\nF none\nS none\nO reach: none');
  calls[0].resolve(answer({ push: 2, steps: THREE.slice(0, 2), why: 'mass', plan: 'ignored', expect: u('army', '>=', 1, 200), n: 'note' }));
  await clock.advance(5000);
  const r = await callModel({ packet: '200 3 1' });
  assert.equal(r.note, 'note');
  assert.equal(r.raw.commander.plan, 'S none');
  const [, F, S1, S2, S3, O] = calls[1].packet.split('\n');
  assert.equal(F, 'F set 1 in force 0 decisions: push 1>2 | orders differed 0/0 | answer read t100, landed t100');
  assert.equal(S1, 'S plan 1 set t100; kept 0 calls; why: mass');
  assert.equal(S2, 'S1 done t200: hold post, guard 1 | army>=3 by t800: MET t200');
  assert.match(S3, /^S2 now since t200: mass li to 5/);
  assert.equal(O, 'O reach: army');
  calls[1].resolve(answer({ push: 2, steps: null, why: null }));
  await clock.advance(10);
  const r2 = await callModel({ packet: '210 3 1' });
  assert.match(r2.raw.commander.plan, /^S plan 1 set t100; kept 0 calls/);
  assert.match(callModel.feedback(), /^F set 2 /);
  await clock.advance(5000);
  await callModel({ packet: '220 3 1' });
  assert.match(calls[2].packet, /\nS plan 1 set t100; kept 1 calls; why: mass\n/);
  await callModel.close();
});

test('commanderModel steps: F\'s answer read/landed cycles are those of the newest landed answer, absent before any lands', async () => {
  const { callModel, clock, calls } = mkS();
  await callModel({ packet: '100 0 1' });
  await callModel({ packet: '150 1 1' });   // no new launch: the first is still in flight
  assert.equal(calls.length, 1);
  calls[0].resolve(answer({ push: 2, steps: THREE.slice(0, 1), why: 'go' }));
  await clock.advance(5000);
  await callModel({ packet: '200 3 1' });
  const [, F] = calls[1].packet.split('\n');
  assert.equal(F, 'F set 1 in force 0 decisions: push 1>2 | orders differed 0/0 | answer read t100, landed t150');
  await callModel.close();
});

test('commanderModel steps, gate events: step MET, step MISSED and plan done ride as E reasons', async () => {
  const { callModel, clock, calls } = mkS({ gate: 'events' });
  await callModel({ packet: '100 0 1' });
  calls[0].resolve(answer({ steps: THREE, why: null }));
  await clock.advance(6000);
  await callModel({ packet: '200 1 1' });
  assert.equal(calls.length, 1);
  await callModel({ packet: '300 3 1' });
  assert.match(calls[1].packet, /\nE step 1 MET$/);
  calls[1].resolve(answer({ steps: null, why: null }));
  await clock.advance(6000);
  await callModel({ packet: '1100 4 1' });
  assert.match(calls[2].packet, /\nE step 2 MISSED$/);
  calls[2].resolve(answer({ steps: [{ do: 'raze', until: u('foe_br', '==', 0, 2000) }], why: 'late' }));
  await clock.advance(6000);
  await callModel({ packet: '1200 4 0' });
  assert.match(calls[3].packet, /\nS plan 2 set t1100; kept 0 calls; replaced 1x, last why: late; all steps done t1200\n[\s\S]*\nE plan done$/);
  await callModel.close();
});

test('planTracker seed: plan 1 in force at t0, exact header, keeps count, replacement header, invalid ignored', () => {
  const seed = { steps: [{ do: 'hold', until: u('army', '>=', 3, 800) }, { do: 'push', until: u('foe_br', '==', 0, 1500) }] };
  const t = planTracker(measure, { seed });
  assert.equal(t.read(), 'S plan 1 set t0; kept 0 calls; given to you\nS1 now since t0: hold | army>=3 by t800: pending\nS2 next: push | foe_br==0 by t1500');
  t.set(null); t.set(null);
  t.see('100 1 1');
  assert.equal(t.read().split('\n')[0], 'S plan 1 set t0; kept 2 calls; given to you');
  t.set([{ do: 'kill br', until: u('foe_br', '==', 0, 500) }], 'new');
  assert.equal(t.read().split('\n')[0], 'S plan 2 set t100; kept 0 calls; replaced 1x, last why: new');
  assert.equal(planTracker(measure, { seed: { steps: [{ do: 'x' }] } }).read(), 'S none');
  assert.equal(planTracker(measure, { seed: null }).read(), 'S none');
});

test('commanderModel steps+seed: the first packet carries the seed S block', async () => {
  const seed = { steps: [{ do: 'hold', until: u('army', '>=', 3, 800) }] };
  const { callModel, calls } = mkS({ seed });
  await callModel({ packet: '100 0 1' });
  assert.equal(calls[0].packet, '100 0 1\nF none\nS plan 1 set t0; kept 0 calls; given to you\nS1 now since t0: hold | army>=3 by t800: pending (max 0, t100)\nO reach: army');
});

test('planTracker: a given plan with a why reads given to you, why; n() is the plan number', () => {
  const t = planTracker(measure);
  assert.equal(t.n(), 0);
  t.see('900 1 1');
  t.set([{ do: 'mass hv', until: u('army', '>=', 3, 1200) }], 'their hv beat li', { given: true });
  t.set(null);
  assert.equal(t.read().split('\n')[0], 'S plan 1 set t900; kept 1 calls; given to you, why: their hv beat li');
  assert.equal(t.n(), 1);
});

const cost = (input, c = 0.01) => ({ ...answer(input), usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 2 }, cost: c });
const mkT = (over = {}) => { const st = fake(), r = mkS({ strategist: { call: st.fn, everyMs: 30000 }, ...over }); return { ...r, scalls: st.calls }; };

test('strategist: first call at once, then only after everyMs with a reason pending; packet is packet, S, O, E', async () => {
  const q = [];
  const { callModel, clock, scalls } = mkT({ observe: { see() {}, read: () => 'O x', events: () => q.splice(0) } });
  await callModel({ packet: '100 0 1' });
  assert.equal(scalls[0].packet, '100 0 1\nS none\nO x\nE first call');
  scalls[0].resolve(cost({ steps: null, why: null }));
  await clock.advance(40000);
  await callModel({ packet: '200 0 1' });
  assert.equal(scalls.length, 1);   // no reason
  q.push('gone: their br#25 gone t250');
  await callModel({ packet: '250 0 1' });
  assert.equal(scalls.length, 2);
  assert.match(scalls[1].packet, /\nE gone: their br#25 gone t250$/);
  q.push('home: x');
  await clock.advance(40000);
  await callModel({ packet: '300 0 1' });   // in flight: waits
  assert.equal(scalls.length, 2);
  scalls[1].resolve(cost({ steps: null, why: null }));
  await clock.advance(10);
  await callModel({ packet: '310 0 1' });
  assert.match(scalls[2].packet, /\nE home: x$/);
  await callModel.close();
});

test('strategist: a valid plan is given, rides out once as raw.strategist with its cost summed; null does not bump kept', async () => {
  const { callModel, clock, calls, scalls } = mkT();
  await callModel({ packet: '100 0 1' });
  scalls[0].resolve(cost({ steps: THREE.slice(0, 1), why: 'their hv beat li' }, 0.05));
  calls[0].resolve(cost({ push: 2, steps: null, why: null }, 0.01));
  await clock.advance(10);
  const r = await callModel({ packet: '150 1 1' });
  assert.equal(r.cost, 0.060000000000000005);
  assert.equal(r.usage.input_tokens, 20);
  assert.deepEqual(r.raw.strategist, { seq: 1, readT: 100, plan: 'S none', input: { steps: THREE.slice(0, 1), why: 'their hv beat li' }, stop: 'tool_use', latencyMs: 5, landedT: 100 });
  const r2 = await callModel({ packet: '160 1 1' });
  assert.equal(r2.raw.strategist, undefined);
  await clock.advance(5000);
  await callModel({ packet: '170 1 1' });
  assert.match(calls[1].packet, /\nS plan 1 set t100; kept 1 calls; given to you, why: their hv beat li\n/);   // the operator's null landed after
  await callModel.close();
});

test('strategist: operator steps read under an older plan drop (staleSteps), levers still apply', async () => {
  const { callModel, clock, calls, scalls } = mkT();
  await callModel({ packet: '100 0 1' });
  scalls[0].resolve(cost({ steps: THREE.slice(0, 1), why: 'given' }));
  await clock.advance(10);
  await callModel({ packet: '110 0 1' });
  calls[0].resolve(cost({ push: 7, steps: [{ do: 'mine', until: u('army', '>=', 9, 2000) }], why: 'mine' }));
  await clock.advance(10);
  const r = await callModel({ packet: '120 0 1' });
  assert.equal(r.raw.commander.staleSteps, true);
  assert.deepEqual(callModel.params(), { push: 7 });
  await clock.advance(5000);
  await callModel({ packet: '130 0 1' });
  assert.match(calls[1].packet, /\nS plan 1 set t100; kept 1 calls; given to you, why: given\n/);
  calls[1].resolve(cost({ push: 7, steps: [{ do: 'mine', until: u('army', '>=', 9, 2000) }], why: 'mine' }));
  await clock.advance(10);
  const r2 = await callModel({ packet: '140 0 1' });
  assert.equal(r2.raw.commander.staleSteps, undefined);
  await clock.advance(5000);
  await callModel({ packet: '150 0 1' });
  assert.match(calls[2].packet, /\nS plan 2 set t130; kept 0 calls; replaced 1x, last why: mine\n/);
  await callModel.close();
});

test('strategist: close aborts its call; steps required; no strategist leaves events() undrained under gate timer', async () => {
  const { callModel, scalls } = mkT();
  await callModel({ packet: '100 0 1' });
  await callModel.close();
  assert.equal(scalls.length, 1);
  assert.throws(() => mkS({ steps: false, strategist: { call: async () => ({}) } }), /strategist needs steps/);
  let drained = 0;
  const { callModel: plain } = mkS({ observe: { see() {}, read: () => null, events: () => { drained++; return []; } } });
  await plain({ packet: '100 0 1' });
  assert.equal(drained, 0);
  await plain.close();
});

test('planTracker read locked: header drops kept', () => {
  const t = planTracker(measure);
  t.see('900 1 1');
  t.set([{ do: 'mass hv', until: u('army', '>=', 3, 1200) }], 'their hv beat li', { given: true });
  assert.equal(t.read({ locked: true }).split('\n')[0], 'S plan 1 set t900; given to you, why: their hv beat li');
});

test('strategist lock: operator steps never touch the plan or kept; lag still recorded', async () => {
  const st = fake(), { callModel, clock, calls } = mkS({ strategist: { call: st.fn, everyMs: 30000, lock: true } });
  await callModel({ packet: '100 0 1' });
  st.calls[0].resolve(cost({ steps: THREE.slice(0, 1), why: 'given' }));
  await clock.advance(10);
  await callModel({ packet: '110 0 1' });
  calls[0].resolve(cost({ push: 7, steps: [{ do: 'mine', until: u('army', '>=', 9, 2000) }], why: 'mine' }));
  await clock.advance(10);
  const r = await callModel({ packet: '120 0 1' });
  assert.equal(r.raw.commander.staleSteps, undefined);
  assert.deepEqual(callModel.params(), { push: 7 });
  await clock.advance(5000);
  await callModel({ packet: '130 0 1' });
  assert.match(calls[1].packet, /answer read t100, landed t110.*\nS plan 1 set t100; given to you, why: given\nS1 now since t100: hold post, guard 1 \| army>=3 by t800: pending/);
  await callModel.close();
});

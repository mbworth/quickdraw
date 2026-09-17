import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commanderModel, feedbackLayer, expectTracker } from '../../src/core/commander.mjs';
import { virtualClock } from '../../src/core/clock.mjs';

const usage = { input_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 4000, output_tokens: 40 };
const zero = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
const plan = (input, over = {}) => ({ act: false, orders: [], note: null, usage, stop: 'tool_use', latencyMs: 12, cost: 0.002, raw: { content: [{ type: 'tool_use', name: 'plan', input }] }, ...over });

const reflex = (packet, params) => ({ o: `${params.mode}${params.push}`, why: ['w'] });
const decode = ({ o }) => ({ act: true, orders: [{ cmd: o }], note: null });
const apply = (input, prev) => ({ mode: typeof input.mode === 'string' ? input.mode : prev.mode, push: Number.isFinite(input.push) ? Math.max(0, Math.min(9, input.push)) : prev.push });

// A commander whose calls resolve only when the test says so.
function fakeCommander() {
  const calls = [];
  const fn = async ({ packet, signal }) => {
    const c = { packet, signal };
    c.done = new Promise(r => (c.resolve = r));
    signal?.addEventListener('abort', () => c.resolve({ act: false, orders: [], note: null, usage: null, stop: 'aborted', error: 'abort', latencyMs: 3, cost: 0 }), { once: true });
    calls.push(c);
    return c.done;
  };
  return { fn, calls };
}

const mk = (over = {}) => {
  const clock = virtualClock();
  const { fn, calls } = fakeCommander();
  const callModel = commanderModel({ reflex, decode, commander: fn, params: { mode: 'a', push: 1 }, apply, everyMs: 5000, clock, ...over });
  return { callModel, clock, calls };
};

test('the reflex answers at 0 ms with the old params while the commander is in flight', async () => {
  const { callModel, clock, calls } = mk();
  const r1 = await callModel({ packet: 'P1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].packet, 'P1\nF none');
  assert.deepEqual(r1.orders, [{ cmd: 'a1' }]);
  assert.equal(r1.stop, 'tool_use');
  assert.equal(r1.latencyMs, 0);
  assert.equal(r1.note, null);
  assert.deepEqual(r1.usage, zero);
  assert.equal(r1.cost, 0);
  assert.deepEqual(r1.raw.params, { mode: 'a', push: 1 });
  assert.equal(r1.raw.commander, undefined);
  assert.deepEqual(r1.raw.why, ['w']);

  await clock.advance(1000);
  const r2 = await callModel({ packet: 'P2' });   // still in flight: same params, no second call
  assert.equal(calls.length, 1);
  assert.deepEqual(r2.orders, [{ cmd: 'a1' }]);
  await callModel.close();
});

test('a commander result lands once: note, usage, cost, raw.commander, new params', async () => {
  const { callModel, clock, calls } = mk();
  await callModel({ packet: 'P1' });
  calls[0].resolve(plan({ mode: 'b', push: 4, n: 'holding the ramp' }));
  await clock.advance(100);

  const r = await callModel({ packet: 'P2' });
  assert.deepEqual(callModel.params(), { mode: 'b', push: 4 });
  assert.deepEqual(r.orders, [{ cmd: 'b4' }]);
  assert.equal(r.note, 'holding the ramp');
  assert.deepEqual(r.usage, usage);
  assert.equal(r.cost, 0.002);
  assert.deepEqual(r.raw.commander, { seq: 1, input: { mode: 'b', push: 4, n: 'holding the ramp' }, stop: 'tool_use', latencyMs: 12, apiPacketN: 1, feedback: 'F none' });
  assert.equal(JSON.stringify(r.raw).includes('P1'), false);   // no packet text in the row

  const r2 = await callModel({ packet: 'P3' });   // each rides out exactly once
  assert.equal(r2.note, null);
  assert.deepEqual(r2.usage, zero);
  assert.equal(r2.cost, 0);
  assert.equal(r2.raw.commander, undefined);
  assert.deepEqual(r2.orders, [{ cmd: 'b4' }]);
  await callModel.close();
});

test('the next commander call waits for everyMs from the last start', async () => {
  const { callModel, clock, calls } = mk();
  await callModel({ packet: 'P1' });
  calls[0].resolve(plan({ mode: 'b', push: 2, n: null }));
  await clock.advance(100);
  await callModel({ packet: 'P2' });
  assert.equal(calls.length, 1);
  await clock.advance(4899);
  await callModel({ packet: 'P3' });
  assert.equal(calls.length, 1);
  await clock.advance(1);
  await callModel({ packet: 'P4' });
  assert.equal(calls.length, 2);
  assert.match(calls[1].packet, /^P4\nF set 1 /);
  await callModel.close();
});

test('a failed commander leaves the params alone and reports the error once', async () => {
  const { callModel, clock, calls } = mk();
  await callModel({ packet: 'P1' });
  calls[0].resolve({ act: false, orders: [], note: null, usage: null, stop: 'timeout', error: 'deadline', latencyMs: 6000, cost: 0 });
  await clock.advance(100);
  const r = await callModel({ packet: 'P2' });
  assert.deepEqual(callModel.params(), { mode: 'a', push: 1 });
  assert.deepEqual(r.orders, [{ cmd: 'a1' }]);
  assert.equal(r.note, null);
  assert.deepEqual(r.raw.commander, { seq: 1, input: null, stop: 'timeout', error: 'deadline', latencyMs: 6000, apiPacketN: 1, feedback: 'F none' });
  await callModel.close();
});

test('close() and an aborted reflex signal abort the call in flight', async () => {
  const { callModel, clock, calls } = mk();
  await callModel({ packet: 'P1' });
  await callModel.close();
  assert.equal(calls[0].signal.aborted, true);
  await clock.advance(5000);
  const r = await callModel({ packet: 'P2' });   // reported once, params untouched, the slot free again
  assert.deepEqual(callModel.params(), { mode: 'a', push: 1 });
  assert.equal(r.raw.commander.stop, 'aborted');
  assert.equal(calls.length, 2);

  const ac = new AbortController();   // game over: the pilot aborts the reflex call, the commander goes with it
  await callModel({ packet: 'P3', signal: ac.signal });
  ac.abort();
  assert.equal(calls[1].signal.aborted, true);
});

test('a reflex that cannot read the packet is stop error:read', async () => {
  const { callModel } = mk({ reflex: () => { throw new Error('no H line'); } });
  const r = await callModel({ packet: 'P' });
  assert.equal(r.stop, 'error:read');
  assert.equal(r.error, 'no H line');
  assert.deepEqual(r.orders, []);
  assert.equal(r.act, false);
  await callModel.close();
});

test('onOrders gets the reflex orders and streamed counts them', async () => {
  const seen = [];
  const { callModel } = mk();
  const r = await callModel({ packet: 'P', onOrders: o => seen.push(...o) });
  assert.deepEqual(seen, [{ cmd: 'a1' }]);
  assert.equal(r.streamed, 1);
  await callModel.close();
});

// F: the feedback layer — what the commander's own last set changed, and what it did to the reflex's orders.
const spyReflex = () => { const seen = []; return { seen, fn: (packet, params) => ({ o: packet === 'X' ? 'fixed' : `${params.mode}${params.push}`, why: ['w'] }) }; };

test('the first commander call sees F none', async () => {
  const { callModel, calls } = mk();
  assert.equal(callModel.feedback(), 'F none');
  await callModel({ packet: 'P1' });
  assert.equal(calls[0].packet, 'P1\nF none');
  await callModel.close();
});

test('F reports the applied diff, the decisions in force and the orders it changed', async () => {
  const { fn } = spyReflex();
  const { callModel, clock, calls } = mk({ reflex: fn });
  await callModel({ packet: 'P1' });
  calls[0].resolve(plan({ mode: 'b', push: 4, n: null }));
  await clock.advance(100);
  await callModel({ packet: 'P2' });            // b4 vs a1: differs
  await callModel({ packet: 'X' });             // same order under either set
  await callModel({ packet: 'P3' });            // differs
  await clock.advance(4900);
  await callModel({ packet: 'P4' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].packet, 'P4\nF set 1 in force 3 decisions: mode a>b push 1>4 | orders differed 2/3 | last: b4 / was a1');
  await callModel.close();
});

test('an answer that changes nothing reads unchanged', async () => {
  const { callModel, clock, calls } = mk();
  await callModel({ packet: 'P1' });
  calls[0].resolve(plan({ mode: 'a', push: 1, n: null }));
  await clock.advance(5000);
  await callModel({ packet: 'P2' });
  assert.equal(calls[1].packet, 'P2\nF set 1 in force 0 decisions: unchanged | orders differed 0/0');
  await callModel.close();
});

test('the F line rides out on the summary and never reaches the reflex', async () => {
  const seen = [];
  const { callModel, clock, calls } = mk({ reflex: (packet, params) => { seen.push(packet); return { o: `${params.mode}${params.push}`, why: ['w'] }; } });
  await callModel({ packet: 'P1' });
  calls[0].resolve(plan({ mode: 'b', push: 4, n: null }));
  await clock.advance(100);
  const r = await callModel({ packet: 'P2' });
  assert.equal(r.raw.commander.feedback, 'F none');
  await callModel({ packet: 'P3' });
  await clock.advance(4900);
  await callModel({ packet: 'P4' });
  assert.equal(calls[1].packet, 'P4\nF set 1 in force 2 decisions: mode a>b push 1>4 | orders differed 2/2 | last: b4 / was a1');
  calls[1].resolve(plan({ mode: 'c', push: 4, n: null }));
  await clock.advance(100);
  const r3 = await callModel({ packet: 'P5' });
  assert.equal(r3.raw.commander.feedback, calls[1].packet.split('\n').pop());
  assert.deepEqual(seen.filter(t => t.includes('F ')), []);
  assert.deepEqual([...new Set(seen)], ['P1', 'P2', 'P3', 'P4', 'P5']);
  await callModel.close();
});

test('feedbackLayer prints null and caps the last part', () => {
  assert.equal(feedbackLayer({ setSeq: 2, sinceN: 4, prev: { target: null, train: 'li' }, cur: { target: '3,4', train: 'li,hv' }, differed: 1, last: null }),
    'F set 2 in force 4 decisions: target null>3,4 train li>li,hv | orders differed 1/4');
  const long = feedbackLayer({ setSeq: 1, sinceN: 1, prev: { a: 1 }, cur: { a: 2 }, differed: 1, last: { o: 'x'.repeat(300), was: 'y' } });
  assert.equal(long.split(' | ').pop().length, 200);
});

// expect: the commander's own claim, graded by the game's measure() and reported back on F next to the plan it belongs to.
const measure = packet => { const m = /^(\d+) (\d+)$/.exec(packet); if (!m) throw new Error('unmeasurable'); return { cycle: Number(m[1]), hv: Number(m[2]) }; };
const mkE = (over = {}) => mk({ measure, ...over });

test('an expect that comes true reads MET; the plan rides with it', async () => {
  const { callModel, clock, calls } = mkE();
  await callModel({ packet: '100 0' });
  calls[0].resolve(plan({ mode: 'a', push: 1, n: null, plan: 'mass heavies', expect: { metric: 'hv', op: '>=', value: 3, by: 1300 } }));
  await clock.advance(100);
  await callModel({ packet: '1100 2' });
  await callModel({ packet: '1210 3' });
  await clock.advance(4900);
  await callModel({ packet: '1250 3' });
  assert.equal(calls[1].packet, '1250 3\nF set 1 in force 2 decisions: unchanged | orders differed 0/2 | plan: mass heavies | expect hv>=3 by t1300: MET t1210');
  await callModel.close();
});

test('an expect still short of its deadline reads pending with the best seen', async () => {
  const { callModel, clock, calls } = mkE();
  await callModel({ packet: '100 0' });
  calls[0].resolve(plan({ mode: 'a', push: 1, n: null, plan: 'mass heavies', expect: { metric: 'hv', op: '>=', value: 3, by: 1300 } }));
  await clock.advance(100);
  await callModel({ packet: '1154 2' });
  await clock.advance(4900);
  await callModel({ packet: '1200 1' });
  assert.match(calls[1].packet, /\| plan: mass heavies \| expect hv>=3 by t1300: pending \(max 2, t1154\)$/);
  await callModel.close();
});

test('an expect past its deadline reads MISSED and the verdict stands', async () => {
  const { callModel, clock, calls } = mkE();
  await callModel({ packet: '100 0' });
  calls[0].resolve(plan({ mode: 'a', push: 1, n: null, plan: 'mass heavies', expect: { metric: 'hv', op: '>=', value: 3, by: 1300 } }));
  await clock.advance(100);
  await callModel({ packet: '1200 2' });
  await callModel({ packet: '1400 1' });
  await clock.advance(4900);
  await callModel({ packet: '1450 1' });
  assert.match(calls[1].packet, /\| expect hv>=3 by t1300: MISSED \(max 2\)$/);
  calls[1].resolve(plan({ mode: 'a', push: 1, n: null, plan: 'hold the post', expect: null }));   // a new answer replaces the verdict
  await clock.advance(5000);
  await callModel({ packet: '1500 1' });
  assert.match(calls[2].packet, /\| plan: hold the post \| expect: none$/);
  await callModel.close();
});

test('<= grades on the minimum seen and == on the last', async () => {
  const { callModel, clock, calls } = mkE();
  await callModel({ packet: '100 5' });
  calls[0].resolve(plan({ mode: 'a', push: 1, n: null, plan: 'trade down', expect: { metric: 'hv', op: '<=', value: 1, by: 900 } }));
  await clock.advance(100);
  await callModel({ packet: '800 3' });
  await callModel({ packet: '950 4' });
  await clock.advance(4900);
  await callModel({ packet: '960 4' });
  assert.match(calls[1].packet, /expect hv<=1 by t900: MISSED \(min 3\)$/);
  calls[1].resolve(plan({ mode: 'a', push: 1, n: null, plan: 'two heavies', expect: { metric: 'hv', op: '==', value: 2, by: 2000 } }));
  await clock.advance(5000);
  await callModel({ packet: '1000 4' });
  assert.match(calls[2].packet, /expect hv==2 by t2000: pending \(last 4, t1000\)$/);
  await callModel.close();
});

test('no measure means no expect clause; no expect means expect: none; a metric the game does not measure is dropped', async () => {
  const { callModel: plainModel, clock: c0, calls: plainCalls } = mk();   // no measure: F is unchanged
  await plainModel({ packet: '100 1' });
  plainCalls[0].resolve(plan({ mode: 'b', push: 2, n: null, plan: 'x', expect: { metric: 'hv', op: '>=', value: 1, by: 200 } }));
  await c0.advance(5000);
  await plainModel({ packet: '200 1' });
  assert.equal(plainCalls[1].packet, '200 1\nF set 1 in force 0 decisions: mode a>b push 1>2 | orders differed 0/0');
  await plainModel.close();

  const { callModel, clock, calls } = mkE();
  await callModel({ packet: '100 0' });
  calls[0].resolve(plan({ mode: 'a', push: 1, n: null, plan: null, expect: { metric: 'ore', op: '>=', value: 9, by: 400 } }));
  await clock.advance(100);
  await callModel({ packet: '200 0' });
  await clock.advance(4900);
  await callModel({ packet: '300 0' });
  assert.match(calls[1].packet, /\| expect: none$/);   // unknown metric and no plan: nothing but the verdict-free clause
  await callModel.close();
});

test('an unreadable packet leaves the grade alone', async () => {
  const { callModel, clock, calls } = mkE();
  await callModel({ packet: '100 0' });
  calls[0].resolve(plan({ mode: 'a', push: 1, n: null, plan: 'p', expect: { metric: 'hv', op: '>=', value: 2, by: 500 } }));
  await clock.advance(100);
  await callModel({ packet: 'junk' });
  await clock.advance(4900);
  await callModel({ packet: 'junk' });
  assert.match(calls[1].packet, /\| plan: p \| expect hv>=2 by t500: pending$/);
  await callModel.close();
});

// claim history: a new expect with the same metric/op as the one in force is the same claim, not a fresh one.
test('expectTracker keeps since/best/moved/values across a same claim, resets on a different one', () => {
  const t = expectTracker(measure);
  t.set({ metric: 'hv', op: '>=', value: 3, by: 900 }, 'mass heavies');
  t.see('100 1');
  t.see('700 2');   // best 2 @700
  t.set({ metric: 'hv', op: '>=', value: 4, by: 950 }, 'mass heavies');   // same claim: by moved, value moved
  assert.deepEqual(t.read().grade, { metric: 'hv', op: '>=', value: 4, by: 950, met: null, best: 2, bestT: 700, since: 0, moved: 1, values: [3, 4], verdict: 'pending' });

  t.see('800 3');   // best keeps accumulating under the same claim
  t.set({ metric: 'hv', op: '>=', value: 4, by: 950 }, 'mass heavies');   // unchanged: no moved bump, no value bump
  assert.equal(t.read().grade.moved, 1);
  assert.deepEqual(t.read().grade.values, [3, 4]);
  assert.equal(t.read().grade.best, 3);

  t.set({ metric: 'foe_hv', op: '>=', value: 1, by: 1000 }, 'switch');   // different metric: fresh claim
  const g = t.read().grade;
  assert.equal(g.since, 800);   // the last packet seen when this claim was made
  assert.equal(g.moved, 0);
  assert.deepEqual(g.values, [1]);
  assert.equal(g.best, null);
});

test('the expect text names the claim history when it exists, omits empty parts', () => {
  const withBoth = { plan: 'mass heavies', grade: { metric: 'hv', op: '>=', value: 2, by: 1250, met: null, best: 2, bestT: 1154, since: 684, moved: 4, values: [3, 4, 3, 2], verdict: 'pending' } };
  assert.equal(feedbackLayer({ setSeq: 5, sinceN: 1, prev: {}, cur: {}, differed: 0, last: null, expect: withBoth }).split('| ').slice(3).join('| '),
    'expect hv>=2 by t1250: pending (max since t684 2, t1154); claim since t684, by moved 4x, value 3>4>3>2');

  const movedOnly = { plan: 'p', grade: { metric: 'hv', op: '>=', value: 3, by: 950, met: null, best: 1, bestT: 900, since: 684, moved: 1, values: [3], verdict: 'pending' } };
  assert.equal(feedbackLayer({ setSeq: 1, sinceN: 1, prev: {}, cur: {}, differed: 0, last: null, expect: movedOnly }).split('| ').slice(3).join('| '),
    'expect hv>=3 by t950: pending (max since t684 1, t900); claim since t684, by moved 1x');

  const valuesOnly = { plan: 'p', grade: { metric: 'hv', op: '>=', value: 2, by: 950, met: 900, best: 2, bestT: 900, since: 684, moved: 0, values: [3, 2], verdict: 'met' } };
  assert.equal(feedbackLayer({ setSeq: 1, sinceN: 1, prev: {}, cur: {}, differed: 0, last: null, expect: valuesOnly }).split('| ').slice(3).join('| '),
    'expect hv>=2 by t950: MET t900; claim since t684, value 3>2');

  const noHistory = { plan: 'p', grade: { metric: 'hv', op: '>=', value: 2, by: 950, met: null, best: 1, bestT: 900, since: 0, moved: 0, values: [2], verdict: 'pending' } };
  assert.equal(feedbackLayer({ setSeq: 1, sinceN: 1, prev: {}, cur: {}, differed: 0, last: null, expect: noHistory }).split('| ').slice(3).join('| '),
    'expect hv>=2 by t950: pending (max 1, t900)');
});

test('a repeated claim carries its history onto F; a fresh claim starts clean', async () => {
  const { callModel, clock, calls } = mkE();
  await callModel({ packet: '100 0' });
  calls[0].resolve(plan({ mode: 'a', push: 1, n: null, plan: 'mass heavies', expect: { metric: 'hv', op: '>=', value: 3, by: 900 } }));
  await clock.advance(100);
  await callModel({ packet: '700 2' });
  await clock.advance(4900);
  await callModel({ packet: '800 2' });   // second launch: first claim, no history yet
  assert.match(calls[1].packet, /expect hv>=3 by t900: pending \(max 2, t700\)$/);

  calls[1].resolve(plan({ mode: 'a', push: 1, n: null, plan: 'mass heavies', expect: { metric: 'hv', op: '>=', value: 4, by: 950 } }));   // same claim, by and value moved
  await clock.advance(100);
  await callModel({ packet: '900 3' });
  await clock.advance(4900);
  await callModel({ packet: '920 3' });
  assert.match(calls[2].packet, /expect hv>=4 by t950: pending \(max since t0 3, t900\); claim since t0, by moved 1x, value 3>4$/);
  await callModel.close();
});

test('feedbackLayer places the expect clause between the orders and the last pair', () => {
  const e = { plan: 'mass heavies', grade: { metric: 'hv', op: '>=', value: 3, by: 1300, met: null, best: 2, bestT: 1154, verdict: 'missed' } };
  assert.equal(feedbackLayer({ setSeq: 1, sinceN: 2, prev: { a: 1 }, cur: { a: 2 }, differed: 1, last: { o: 'x', was: 'y' }, expect: e }),
    'F set 1 in force 2 decisions: a 1>2 | orders differed 1/2 | plan: mass heavies | expect hv>=3 by t1300: MISSED (max 2) | last: x / was y');
});

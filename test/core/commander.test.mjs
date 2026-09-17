import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commanderModel, feedbackLayer } from '../../src/core/commander.mjs';
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

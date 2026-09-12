import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runPilot } from '../../src/core/pilot.mjs';
import { createRecorder, readRun } from '../../src/core/record.mjs';
import { virtualClock } from '../../src/core/clock.mjs';
import { createAdapter } from '../../src/games/mock/index.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-pilot-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const memRecorder = () => {
  const lines = [];
  return { lines, writeNow(kind, obj) { lines.push({ kind, ...obj }); return lines.length; }, writeState(s) { return this.ensureState(s); }, ensureState(s) { if (!s._ref) { lines.push({ kind: 'state', idx: s.idx }); s._ref = lines.length; } return s._ref; }, flush() {}, flushAndClose() {} };
};
const stub = ({ delayMs = 0, clock, orders = [{ cmd: 'move', id: 1, to: 5 }], act = true } = {}) => async () => {
  if (delayMs) await new Promise(r => clock.setTimeout(r, delayMs));
  return { act, orders, note: null, usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 100, output_tokens: 5 }, stop: 'tool_use', latencyMs: delayMs, cost: 0.001 };
};
async function play({ seed = 1, faults = [], turns = 2, delayMs = 0, opts = {}, record = memRecorder(), callModel, advanceMs } = {}) {
  const clock = virtualClock(1000);
  const adapter = createAdapter({}, { clock, seed, faults, turns });
  let conceded = 0; const realConcede = adapter.concede; adapter.concede = async () => { conceded++; return realConcede(); };
  await adapter.connect(); await adapter.seat({});
  const p = runPilot({ adapter, callModel: callModel || stub({ delayMs, clock }), clock, record, opts: { heartbeatMs: 100000, deadlineMarginMs: 100, ...opts } });
  await clock.advance(advanceMs ?? turns * 1000 + 500);
  const out = await p;
  return { out, adapter, lines: record.lines, clock, conceded: () => conceded };
}
const calls = lines => lines.filter(l => l.kind === 'call');

test('a decision fires on the turn event and the order is sent', async () => {
  const { out, adapter, lines } = await play();
  assert.equal(out.done.outcome.won, true);
  assert.equal(out.exitCode, 0);
  const c = calls(lines);
  assert.ok(c.length >= 2);
  assert.ok(c[0].triggers.some(t => t.cls === 'turn' && t.key === 't1'));
  assert.equal(c[0].packet.split('\n')[0], 'T1 me 0:0');
  assert.deepEqual(adapter.sent[0], { cmd: 'move', id: 1, to: 5 });
  assert.equal(c[0].prevDecisionRef, null);
  assert.equal(c[1].prevDecisionRef, c[0].stateRef);
  assert.equal(c[0].eventArrivalT, 1000); assert.equal(c[0].anchor, 'event');
  const T = c[0].latency;
  assert.equal(T.waitMs + T.queueMs + T.encodeMs + T.apiMs + T.expandMs + T.validateMs + T.sendMs, T.totalMs, 'the split sums to the total');
});

test('triggers during a slow call coalesce into the next decision', async () => {
  const { lines } = await play({ delayMs: 1200, turns: 2, opts: { staleAfterMs: 5000 } });
  const coalesced = lines.filter(l => l.kind === 'trigger' && l.outcomes.some(o => o.outcome === 'coalesced'));
  assert.ok(coalesced.length >= 1);
  const re = lines.find(l => l.kind === 'trigger' && l.reoffer && l.outcomes.some(o => o.outcome === 'fired'));
  assert.ok(re, 'dirty set re-offered and fired');
  assert.equal(calls(lines).length, 2);
});

test('done mid-call skips the decision; nothing is sent', async () => {
  const { adapter, lines, out } = await play({ delayMs: 500, faults: [{ at: 200, kind: 'doneMidCall' }], turns: 1 });
  assert.equal(adapter.sent.length, 0);
  assert.equal(calls(lines)[0].skipped, 'ended');
  assert.equal(out.exitCode, 3);
});

test('a decision sent after the state went stale is dropped', async () => {
  const { adapter, lines } = await play({ delayMs: 300, turns: 1, opts: { staleAfterMs: 200 } });
  assert.equal(adapter.sent.length, 0);
  assert.deepEqual(lines.find(l => l.kind === 'decision').dropped.map(d => d.reason), ['stale']);
});

test('a rejected cmd reaches lastOrders of the next packet', async () => {
  const { lines } = await play({ faults: [{ at: 50, kind: 'rejectCmd' }] });
  const c = calls(lines).find(x => x.lastOrders.some(o => o.error === 'rejected: scripted'));
  assert.ok(c);
  assert.match(c.packet, /rejected: scripted/);
});

test('validate drops and the cap are recorded as dropped reasons', async () => {
  const { lines, adapter } = await play({ turns: 1, callModel: stub({ orders: [{ cmd: 'move', id: 'p#3', to: 1 }, { cmd: 'move', id: 'zz', to: 1 }, { cmd: 'move', id: 2, to: 1 }] }) });
  const d = lines.find(l => l.kind === 'decision');
  assert.deepEqual(d.sent, [{ cmd: 'move', id: 3, to: 1 }]);
  assert.deepEqual(d.dropped.map(x => x.reason).sort(), ['bad-id', 'cap']);
  assert.ok(adapter.sent.every(c => c.id === 3));
});

test('disconnect suspends; the first fresh state after reconnect fires', async () => {
  const { lines } = await play({ delayMs: 50, faults: [{ at: 100, kind: 'disconnect', forMs: 300 }], turns: 1 });
  assert.ok(lines.some(l => l.kind === 'disconnect') && lines.some(l => l.kind === 'reconnect'));
  const resume = lines.find(l => l.kind === 'trigger' && l.outcomes.some(o => o.cls === 'resume' && o.outcome === 'fired'));
  assert.ok(resume);
  const after = calls(lines).find(c => c.triggers.some(t => t.cls === 'resume'));
  assert.equal(after.prevDecisionRef, null, 'prevDecisionState cleared on reconnect');
});

test('budget stops deciding without conceding; concede-on budget concedes', async () => {
  const a = await play({ opts: { maxDecisions: 1 } });
  assert.equal(calls(a.lines).length, 1);
  assert.ok(a.lines.some(l => l.kind === 'budget-stop'));
  assert.equal(a.conceded(), 0);
  assert.equal(a.out.done.why, 'checkmate');
  const b = await play({ opts: { maxUsd: 0.0015, concedeOn: 'budget' } });
  assert.equal(b.conceded(), 1);
  assert.equal(b.out.done.why, 'concede');
});

test('a timed-out call re-encodes once, or skips when dirty', async () => {
  const clock0 = { n: 0 };
  const cm = async () => { clock0.n++; return { act: false, orders: [], usage: null, stop: clock0.n === 1 ? 'timeout' : 'tool_use', latencyMs: 0, cost: 0 }; };
  const { lines } = await play({ turns: 1, callModel: cm });
  const c = calls(lines);
  assert.equal(c[0].skipped, 're-encode');
  assert.equal(c[1].stop, 'tool_use');
});

test('stop file leaves with exit 2', async () => {
  const stop = path.join(dir, 'stop');
  const clock = virtualClock();
  const adapter = createAdapter({}, { clock, seed: 1, turns: 5 });
  await adapter.seat({});
  const p = runPilot({ adapter, callModel: stub({ clock }), clock, opts: { heartbeatMs: 100000, stopFile: stop, stopPollMs: 100 } });
  await clock.advance(1200);
  fs.writeFileSync(stop, '');
  await clock.advance(200);
  assert.equal((await p).exitCode, 2);
});

test('the call line refs resolve in a real run file', async () => {
  const clock = virtualClock(5000);
  const rec = createRecorder(path.join(dir, 'run.jsonl'), { clock });
  const { lines: _ } = await play({ record: rec, turns: 2 }).catch(() => ({}));
  rec.flushAndClose();
  const rows = readRun(rec.file);
  const c = rows.find(r => r.kind === 'call');
  assert.equal(rows[c.stateRef - 1].kind, 'state');
  assert.equal(rows[c.stateRef - 1].native.turn, 1);
  for (const ref of c.triggerRefs) assert.ok(rows[ref - 1].outcomes.some(o => o.outcome === 'fired'));
  const c2 = rows.filter(r => r.kind === 'call')[1];
  assert.equal(rows[c2.prevDecisionRef - 1].idx, rows[c.stateRef - 1].idx);
});

test('exit code on draw', async () => {
  const { out } = await play({ seed: 3 });
  assert.equal(out.done.outcome.draw, true);
  assert.equal(out.exitCode, 3);
});

test('an ended state waits one refresh for the adapter done, so the outcome is kept', async () => {
  const clock = virtualClock(1000);
  const adapter = createAdapter({}, { clock, seed: 1, turns: 1, timeline: [[0, 'state', { turn: 1, phase: 'me', deadlineIn: 600 }], [500, 'end', {}], [550, 'done', { outcome: { won: true }, why: 'late' }]] });
  await adapter.seat({});
  const rec = memRecorder();
  const p = runPilot({ adapter, callModel: stub({ clock }), clock, record: rec, opts: { heartbeatMs: 100000, deadlineMarginMs: 100 } });
  await clock.advance(2000);
  const out = await p;
  assert.equal(out.done.outcome.won, true);
  assert.equal(out.done.why, 'late');
  assert.equal(rec.lines.filter(l => l.kind === 'done').length, 1);
});

test('the heartbeat buys no call while the game is pregame', async () => {
  const clock = virtualClock(1000);
  const adapter = createAdapter({}, { clock, seed: 1, turns: 1, timeline: [[0, 'state', { turn: 0, phase: 'pregame', deadlineIn: null }], [7000, 'state', { turn: 1, phase: 'me', deadlineIn: 600 }], [7000, 'event', { cls: 'turn', key: 't1' }], [8000, 'done', { outcome: { won: true }, why: 'x' }]] });
  await adapter.seat({});
  const rec = memRecorder();
  const p = runPilot({ adapter, callModel: stub({ clock }), clock, record: rec, opts: { heartbeatMs: 1000, deadlineMarginMs: 100 } });
  await clock.advance(9000);
  await p;
  const c = calls(rec.lines);
  assert.ok(c.length >= 1 && c.every(x => x.eventArrivalT >= 8000), 'no call before the game is active');
  assert.ok(rec.lines.some(l => l.kind === 'trigger' && l.outcomes.some(o => o.cls === 'heartbeat' && o.outcome === 'suppressed:cannot-act')));
  assert.ok(!rec.lines.some(l => l.kind === 'crash'));
});

test('a heartbeat before the first state is not a decision and not a crash', async () => {
  const clock = virtualClock(1000);
  const em = new EventEmitter();
  const silent = {   // an adapter that says nothing until told to
    meta: { name: 's', classes: ['turn'], orderCap: 1, refreshMs: 0 }, tool: {}, on: (e, f) => em.on(e, f),
    async connect() {}, async seat() { return { gameId: 's', seat: 'me' }; }, async start() {}, async leave() {}, async concede() {},
    canAct: () => true, deadline: () => null, derive: () => [], encode: ({ state }) => [{ name: 'h', priority: 0, text: `T${state.native.turn}` }],
    expand: c => ({ cmds: c, dropped: [] }), validate: c => ({ keep: c, dropped: [] }), async send(c) { return c.map(() => ({ ok: true })); },
  };
  const rec = memRecorder();
  const p = runPilot({ adapter: silent, callModel: stub({ clock }), clock, record: rec, opts: { heartbeatMs: 1000 } });
  await clock.advance(2500);
  assert.ok(rec.lines.some(l => l.kind === 'trigger' && l.outcomes.some(o => o.cls === 'heartbeat' && o.outcome === 'fired')), 'the heartbeat fired into no state');
  assert.equal(calls(rec.lines).length, 0);
  em.emit('event', { cls: 'turn', key: 't1' });
  em.emit('state', { header: { lifecycle: 'active', phaseNative: 'me', gameId: 's', seat: 'me' }, native: { turn: 1 } });
  await clock.advance(100);
  em.emit('done', { outcome: { won: true }, why: 'x' });
  const out = await p;
  assert.equal(out.exitCode, 0);
  assert.equal(calls(rec.lines).length, 1);
  assert.ok(!rec.lines.some(l => l.kind === 'crash'));
});

test('a stop signal finishes the run with exit 130; a transport close finishes it with exit 1', async () => {
  const stopper = new AbortController();
  const clock = virtualClock(1000);
  const adapter = createAdapter({}, { clock, seed: 1, turns: 5 });
  await adapter.seat({});
  const p = runPilot({ adapter, callModel: stub({ clock }), clock, stop: stopper.signal, opts: { heartbeatMs: 100000 } });
  await clock.advance(1500); stopper.abort(); await clock.advance(100);
  const out = await p;
  assert.equal(out.exitCode, 130); assert.equal(out.done.why, 'signal');
  const t = await play({ turns: 5, faults: [{ at: 1500, kind: 'close' }] });
  assert.equal(t.out.exitCode, 1); assert.equal(t.lines.find(l => l.kind === 'done').why, 'transport');
});

test('maxInFlight 2: a ranked trigger during a slow call starts a second call instead of waiting; decisions land in return order', async () => {
  // mock timeline, 1200 ms calls: call 1 on t1 at 1000 runs to 2200; the turn deadline at 1500 starts call 2 while it is in flight.
  const { lines, adapter } = await play({ delayMs: 1200, turns: 3, opts: { maxInFlight: 2, staleAfterMs: 5000 }, advanceMs: 6000 });
  const c = calls(lines);
  const ns = c.map(x => x.n);
  assert.deepEqual(ns.slice(0, 4), [1, 2, 3, 4]); assert.equal(new Set(ns).size, ns.length, 'numbers are assigned at start and unique');
  assert.equal(c[1].overlap, 1, 'the second call started while the first was in flight');
  assert.equal(c[1].latency.waitMs, 0, 'the deadline fired at once instead of after the first call');
  assert.ok(c[1].pending[0].some(t => t.key === 't1'), 'the second packet was told the first call was still in flight');
  assert.equal(c[1].prevDecisionRef, c[0].stateRef, 'the overlapping packet’s delta starts at the previous packet’s state');
  assert.equal(c[0].pending, undefined); assert.equal(c[0].overlap, undefined);
  assert.deepEqual(lines.filter(l => l.kind === 'decision').map(l => l.n), [1, 2, 3, 4], 'completed decisions in return order; the fifth ended with the game');
  assert.ok(c.slice(4).every(x => x.skipped === 'ended'), 'calls in flight at the end are skipped');
  assert.ok(adapter.sent.length >= 4);
  const coalescedTwo = lines.some(l => l.kind === 'trigger' && l.outcomes.some(o => o.outcome === 'coalesced'));
  assert.ok(coalescedTwo, 'with both slots busy the next trigger still coalesces');
  assert.ok(c.some(x => x.triggers.some(t => t.key === 't3')), 'game 26: after overlaps and reoffers the engine still fires (in-flight count returns to 0)');
});

test('maxInFlight 2: a heartbeat never takes the second slot', async () => {
  const { lines } = await play({ delayMs: 1200, turns: 2, opts: { maxInFlight: 2, heartbeatMs: 200, staleAfterMs: 5000 }, advanceMs: 5000 });
  const c = calls(lines);
  assert.ok(c.some(x => x.overlap > 0), 'some call overlapped');
  assert.ok(c.every(x => !(x.overlap > 0 && x.triggers.every(t => t.cls === 'heartbeat'))), 'no overlapping call was a bare heartbeat');
});

test('eventTick: an event fires a decision at once on the latest state instead of waiting for the next state push', async () => {
  // the mock pushes state every 100 ms; an event at 350 waits 50 ms for the next push unless the core ticks on it
  const timeline = [[0, 'state', { turn: 1, phase: 'me', deadlineIn: null }], [350, 'event', { cls: 'turn', key: 'late' }], [1000, 'state', { turn: 1, phase: 'me', deadlineIn: null }], [2000, 'done', { outcome: { won: true }, why: 'checkmate' }]];
  const run = async eventTick => {
    const clock = virtualClock(1000);
    const adapter = createAdapter({}, { clock, timeline });
    await adapter.connect(); await adapter.seat({});
    const record = memRecorder();
    const p = runPilot({ adapter, callModel: stub({ clock }), clock, record, opts: { heartbeatMs: 100000, deadlineMarginMs: 100, eventTick } });
    await clock.advance(3000); await p;
    return calls(record.lines).find(c => c.triggers.some(t => t.key === 'late'));
  };
  const on = await run(true), off = await run(false);
  assert.equal(on.latency.waitMs, 0, 'ticked on arrival');
  assert.equal(off.latency.waitMs, 50, 'waited for the next push');
  assert.equal(on.stateRef > 0 && on.anchor, 'event');
});

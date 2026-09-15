import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter, meta, toHeader } from '../../../src/games/microrts/index.mjs';
import { derive } from '../../../src/games/microrts/events.mjs';
import { virtualClock } from '../../../src/core/clock.mjs';
import { fakeEngine, settle, rawState, RAW_UTT, tinySnap, tiny } from './helpers.mjs';

const live = [];   // every adapter and socket a test opened, closed at the end whatever happened in between
after(async () => { for (const { a, eng } of live) { try { await a.leave(); } catch {} try { eng.close(); } catch {} } });

async function seated(opts = {}) {
  const clock = virtualClock();
  const a = createAdapter({}, { clock, port: 0, spawn: false, cycleMs: 0, ...opts });   // pacing has its own tests in proto.test.mjs
  const seen = { states: [], events: [], done: [], closed: 0 };
  a.on('state', s => seen.states.push(s));
  a.on('event', e => seen.events.push(e));
  a.on('done', d => seen.done.push(d));
  a.on('close', () => seen.closed++);
  await a.connect();
  const eng = fakeEngine(a.proto.port);
  live.push({ a, eng });
  await eng.ready; await eng.next();
  eng.send('utt', JSON.stringify(RAW_UTT));
  await eng.next();
  const s = await a.seat();
  return { a, eng, clock, seen, seat: s };
}

test('meta is the whole trigger vocabulary and one batch tool', () => {
  assert.equal(meta.name, 'microrts');
  assert.deepEqual(meta.classes, ['danger', 'contact', 'loss', 'idle', 'done', 'economy', 'info']);
  assert.equal(meta.actionMode, 'batch');
  assert.equal(meta.toolName, 'orders');
  assert.equal(meta.refreshMs, 500);
  assert.ok(Object.isFrozen(meta));
  assert.throws(() => createAdapter({}, {}), /needs opts.clock/);
});

test('seat waits for the socket and the type table, then names the game', async () => {
  const { a, eng, seat } = await seated();
  assert.equal(seat.seat, 0);
  try { assert.match(seat.gameId, /^basesWorkers16x16-WorkerRush-[a-z0-9]+$/); } finally { await a.leave(); eng.close(); }
});

test('the first getAction turns the game active and emits a materialized snapshot', async () => {
  const { a, eng, seen, clock } = await seated();
  eng.send('getAction 0', JSON.stringify(rawState(0)));
  await eng.next();
  const s = seen.states.at(-1);
  assert.equal(s.header.lifecycle, 'active');
  assert.equal(s.header.clocks.cycle, 0);
  assert.equal(s.native.me, 0);
  assert.deepEqual(s.native.res, [5, 5]);
  assert.equal(s.native.units.length, 4);
  assert.ok(s.native.tt.Worker.cost === 1, 'the type table rides on the snapshot so replay is pure');
  assert.equal(a.canAct(s), true);
  assert.equal(a.deadline(s), null);
  await a.leave(); eng.close();
});

test('busy, state and eta are derived per unit from the actions array', async () => {
  const { a, eng, seen } = await seated();
  eng.send('getAction 0', JSON.stringify(rawState(12, null, [{ ID: 3, time: 10, action: { type: 2, parameter: 0 } }])));
  await eng.next();
  const u = seen.states.at(-1).native.units.find(x => x.id === 3);
  assert.equal(u.busy, true);
  assert.equal(u.st, 'harvest');
  assert.equal(u.eta, 18, 'harvestTime 20, issued at 10, now 12');
  assert.equal(u.idleFor, 0);
  await a.leave(); eng.close();
});

test('cycle-to-cycle diffs become events: started, loss, kill, done, danger', async () => {
  const { a, eng, seen } = await seated();
  const base = rawState(0).pgs.units;
  eng.send('getAction 0', JSON.stringify(rawState(0)));
  await eng.next();
  assert.deepEqual(seen.events.map(e => e.cls + ':' + e.key), ['info:started']);
  const hurt = base.map(u => (u.ID === 2 ? { ...u, hitpoints: 6 } : u)).filter(u => u.ID !== 3)
    .concat([{ type: 'Light', ID: 9, player: 0, x: 2, y: 1, resources: 0, hitpoints: 4 }]);
  eng.send('getAction 0', JSON.stringify(rawState(1, hurt)));
  await eng.next();
  const got = seen.events.slice(1).map(e => e.cls + ':' + e.key).sort();
  assert.deepEqual(got, ['danger:2', 'done:9', 'loss:3']);
  await a.leave(); eng.close();
});

test('derive: contact by grid cell, idle units, economy on a purchase line and an idle producer', () => {
  const near = tiny(); near.units[3].x = 1; near.units[3].y = 2;   // enemy next to my base
  const d = derive({ native: near }).map(x => x.cls + ':' + x.key);
  assert.ok(d.includes('contact:0,0'), JSON.stringify(d));
  assert.ok(d.includes('economy:b2'), 'an idle base is a spend the packet should show');
  assert.ok(d.includes('economy:rWorker'), '5 resources clears the worker line');
  const alone = tiny(); alone.units = alone.units.filter(u => u.player !== 1);
  assert.equal(derive({ native: alone }).some(x => x.cls === 'contact'), false, 'no enemy, no contact');
  const stale = tiny(); stale.units[2].idleFor = 30;
  assert.ok(derive({ native: stale }).some(x => x.cls === 'idle' && x.key === 'u3'));
  const poor = tiny({ res: [0, 0] });
  assert.equal(derive({ native: poor }).some(x => x.key === 'rWorker'), false);
});

test('gameOver: done before the ended state, draw on -1, win on my seat', async () => {
  for (const [winner, outcome] of [[-1, { draw: true }], [0, { won: true }], [1, { won: false }]]) {
    const { a, eng, seen } = await seated();
    eng.send('getAction 0', JSON.stringify(rawState(300)));
    await eng.next();
    const before = seen.states.length;
    eng.send('gameOver ' + winner);
    await eng.next();
    assert.deepEqual(seen.done[0].outcome, outcome);
    assert.equal(seen.states.length, before + 1);
    assert.equal(seen.states.at(-1).header.lifecycle, 'ended');
    assert.equal(seen.closed, 0, 'the socket closing after gameOver is not a transport failure');
    await a.leave(); eng.close();
  }
});

test('the engine vanishing before gameOver is a transport close', async () => {
  const { a, eng, seen } = await seated();
  eng.close();
  await settle(50);
  assert.equal(seen.closed, 1);
  await a.leave();
});

test('concede reports a loss without waiting for the engine', async () => {
  const { a, eng, seen } = await seated();
  await a.concede();
  assert.deepEqual(seen.done[0].outcome, { won: false });
  await a.leave(); eng.close();
});

test('send goes through the buffer and lands on the next cycle', async () => {
  const { a, eng } = await seated();
  eng.send('getAction 0', JSON.stringify(rawState(0)));
  await eng.next();
  const p = a.send([{ cmd: 'harvest', units: [3], node: 1 }]);
  eng.send('getAction 0', JSON.stringify(rawState(1)));
  const line = await eng.next();
  assert.deepEqual(await p, [{ ok: true }]);
  assert.deepEqual(JSON.parse(line), [{ unitID: 3, unitAction: { type: 2, parameter: 0 } }]);
  await a.leave(); eng.close();
});

test('states keep flowing on the refresh cadence while the engine is quiet', async () => {
  const { a, eng, seen, clock } = await seated();
  eng.send('getAction 0', JSON.stringify(rawState(0)));
  await eng.next();
  const n = seen.states.length;
  await clock.advance(1600);
  assert.ok(seen.states.length >= n + 3, `${seen.states.length} vs ${n}`);
  await a.leave(); eng.close();
});

test('toHeader maps lifecycle to a native phase name', () => {
  assert.equal(toHeader({ cycle: 3 }, 'pregame', 'g', 0).phaseNative, 'notStarted');
  assert.equal(toHeader({ cycle: 3 }, 'active', 'g', 0).phaseNative, 'running');
  assert.equal(toHeader({ cycle: 3 }, 'ended', 'g', 0).phaseNative, 'over');
});

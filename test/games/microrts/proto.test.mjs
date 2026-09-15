import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createProto } from '../../../src/games/microrts/proto.mjs';
import { virtualClock } from '../../../src/core/clock.mjs';
import { fakeEngine, settle, rawState, RAW_UTT } from './helpers.mjs';

const live = [];   // every server and socket a test opened, closed at the end whatever happened in between
after(() => { for (const { p, eng } of live) { try { eng.close(); } catch {} try { p.close(); } catch {} } });

async function start(opts = {}) {
  const clock = virtualClock();
  const seen = { utt: [], pregame: [], over: [], budget: [], states: [] };
  const p = createProto({
    port: 0, cycleMs: 100, clock, spawnJava: false,
    onAction: (gs, player) => { seen.states.push({ gs, player }); return opts.actions ? opts.actions(gs) : []; },
    ...opts,
  });
  p.on('utt', u => seen.utt.push(u));
  p.on('pregame', s => seen.pregame.push(s));
  p.on('gameover', w => seen.over.push(w));
  p.on('budget', b => seen.budget.push(b));
  const port = await p.listen();
  const eng = fakeEngine(port);
  live.push({ p, eng });
  await eng.ready;
  return { p, eng, clock, seen };
}

test('the handshake: welcome, budget/utt/preGameAnalysis acked, gameOver acked', async () => {
  const { p, eng, seen } = await start();
  assert.equal(await eng.wait(1), 'welcome');
  eng.send('budget 100 0');
  assert.equal(await eng.wait(2), 'ack');
  eng.send('utt', JSON.stringify(RAW_UTT));
  assert.equal(await eng.wait(3), 'ack');
  eng.send('preGameAnalysis 1000', JSON.stringify(rawState(0)));
  assert.equal(await eng.wait(4), 'ack');
  eng.send('gameOver -1');
  assert.equal(await eng.wait(5), 'ack');
  assert.deepEqual(seen.budget, [[100, 0]]);
  assert.equal(seen.utt.length, 1);
  assert.equal(seen.pregame.length, 1);
  assert.deepEqual(seen.over, [-1]);
  eng.close(); p.close();
});

test('utt arrives twice (SocketAI sends it on reset and at start) and both are acked', async () => {
  const { p, eng, seen } = await start();
  await eng.wait(1);
  eng.send('utt', JSON.stringify(RAW_UTT), 'utt', JSON.stringify(RAW_UTT));
  await eng.wait(3);
  assert.deepEqual(eng.got.slice(1), ['ack', 'ack']);
  assert.equal(seen.utt.length, 2);
  eng.close(); p.close();
});

test('getAction gets exactly one PlayerAction line, carrying what onAction returned', async () => {
  const { p, eng, seen } = await start({ actions: gs => [{ unitID: 3, unitAction: { type: 1, parameter: 0 } }] });
  await eng.wait(1);
  eng.send('getAction 0', JSON.stringify(rawState(7)));
  assert.equal(await eng.wait(2), '[{"unitID":3,"unitAction":{"type":1,"parameter":0}}]');
  assert.equal(seen.states[0].player, 0);
  assert.equal(seen.states[0].gs.time, 7);
  eng.close(); p.close();
});

test('we pace the game: the reply is withheld until cycleMs has passed since the previous one', async () => {
  const { p, eng, clock } = await start();
  await eng.wait(1);
  eng.send('getAction 0', JSON.stringify(rawState(0)));
  assert.equal(await eng.wait(2), '[]', 'the first reply goes out at once');
  eng.send('getAction 0', JSON.stringify(rawState(1)));
  await settle();
  assert.equal(eng.got.length, 2, 'the second is held back');
  await clock.advance(99);
  await settle();
  assert.equal(eng.got.length, 2, 'still held at 99 of 100 ms');
  await clock.advance(1);
  assert.equal(await eng.wait(3), '[]');
  eng.close(); p.close();
});

test('a malformed payload is answered anyway, so the engine never blocks forever', async () => {
  const { p, eng, seen } = await start();
  await eng.wait(1);
  eng.send('getAction 0', 'not json');
  assert.equal(await eng.wait(2), '[]');
  eng.send('utt', '{oops');
  assert.equal(await eng.wait(3), 'ack');
  assert.equal(seen.states.length, 0);
  eng.close(); p.close();
});

test('an unknown line is ignored and a second engine is refused', async () => {
  const { p, eng } = await start();
  await eng.wait(1);
  eng.send('nonsense', '', 'budget 1 1');
  assert.equal(await eng.wait(2), 'ack');
  const second = fakeEngine(p.port);
  await settle(50);
  assert.equal(second.got.length, 0, 'one engine per adapter');
  second.close(); eng.close(); p.close();
});

test('close() emits nothing after it is called', async () => {
  const { p, eng } = await start();
  await eng.wait(1);
  let closed = 0;
  p.on('close', () => closed++);
  p.close();
  await settle(30);
  assert.equal(closed, 0);
  eng.close();
});

test('spawnEngine without a local clone is a clear error, not a crash', async () => {
  const { p, eng } = await start({ spawnJava: true, dir: null });
  try { assert.throws(() => p.spawnEngine(), /MICRORTS_LOCAL/); } finally { eng.close(); p.close(); }
});

// The transport against a scripted fake socket: reconnect discipline, untrusted frames, request timeouts, partial batches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { connect } from '../../../src/games/ashfall/ctl.mjs';
import { createAdapter } from '../../../src/games/ashfall/index.mjs';
import { makeAuth } from '../../../src/games/ashfall/auth.mjs';
import { virtualClock } from '../../../src/core/clock.mjs';

class FakeWS extends EventEmitter {
  static OPEN = 1;
  static all = [];
  static script = {};
  constructor(url, opts) {
    super(); this.url = url; this.opts = opts; this.readyState = 0; this.sent = []; FakeWS.all.push(this);
    queueMicrotask(() => { if (this.readyState !== 0) return; this.readyState = 1; this.emit('open'); this.push({ type: 'hello', player: null }); });
  }
  push(obj) { this.emit('message', Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))); }
  send(s) {
    const m = JSON.parse(s); this.sent.push(m);
    if (FakeWS.script.sendThrows?.(m)) throw new Error('socket write failed');
    const r = FakeWS.script.reply?.(m, this);
    if (r) queueMicrotask(() => this.push({ type: 'result', id: m.id, ...r }));
  }
  terminate() { if (this.readyState === 3) return; this.readyState = 3; queueMicrotask(() => this.emit('close')); }
  close() { this.terminate(); }
}
const ok = result => ({ ok: true, result });
const baseReply = m => (m.type === 'register' ? ok({ id: 'p1' }) : m.type === 'create' || m.type === 'join' ? ok({ game: { id: 5 }, team: 0 }) : m.type === 'games' ? ok({ games: [] }) : ok({}));
const setup = async (over = {}) => {
  FakeWS.all = []; FakeWS.script = { reply: baseReply, ...over };
  const clock = virtualClock(1000);
  const c = connect({ host: 'ws://fake', auth: makeAuth({ name: 'qd' }), clock, WS: FakeWS });
  const events = { disconnect: 0, reconnect: 0, close: 0 };
  for (const k of Object.keys(events)) c.on(k, () => events[k]++);
  await c.connect(); await c.create({});
  return { c, clock, events };
};

test('a rejected rejoin never forks a second reconnect loop, and the loop gives up with one close', async () => {
  const { c, clock, events } = await setup({ reply: m => (m.type === 'join' ? { ok: false, error: 'game over' } : baseReply(m)) });
  assert.equal(FakeWS.all.length, 1);
  c.terminate();
  await clock.advance(60000);
  assert.equal(FakeWS.all.length, 11, 'one socket per attempt, ten attempts');
  assert.deepEqual(events, { disconnect: 1, reconnect: 0, close: 1 });
  assert.ok(FakeWS.all.every(w => w.readyState === 3), 'every failed socket was terminated');
  assert.equal(c.stats.reconnects, 0);
});

test('a successful rejoin reconnects once; frames queued during the outage are not carried onto the new socket', async () => {
  const { c, clock, events } = await setup();
  const dead = FakeWS.all[0];
  dead.terminate();
  const ghost = c.cmd('stop', { units: ['army'] });   // issued before the close event lands
  await clock.advance(5000);
  assert.equal(events.reconnect, 1); assert.equal(c.stats.reconnects, 1);
  const r = await ghost;
  assert.equal(r.ok, false); assert.match(r.error, /disconnected/);
  assert.ok(!FakeWS.all[1].sent.some(m => m.type === 'cmd'), 'the new socket carried only the rejoin');
});

test('malformed hub frames are ignored, never thrown', async () => {
  const { c } = await setup();
  const ws = FakeWS.all[0];
  let states = 0; c.on('state', () => states++);
  for (const f of ['garbage', '[]', 'null', { type: 'state' }, { type: 'event' }, { type: 'event', ev: 7 }, { type: 'result' }, { type: 'result', id: 999 }, { type: 'nope' }]) ws.push(f);
  ws.push({ type: 'state', state: { time: 1 } });
  assert.equal(states, 1);
  assert.equal(ws.opts.maxPayload, 1 << 20);
});

test('a request the hub never answers times out instead of hanging a decision', async () => {
  const { c, clock } = await setup({ reply: m => (m.type === 'cmd' ? null : baseReply(m)) });
  const p = c.cmd('stop', { units: ['army'] });
  await clock.advance(10000);
  assert.deepEqual(await p, { ok: false, error: 'timeout' });
});

test('adapter.send reports each cmd on its own: one failed write does not unsay the others', async () => {
  FakeWS.all = []; FakeWS.script = { reply: baseReply, sendThrows: m => m.type === 'cmd' && m.args.x === 2 };
  const clock = virtualClock(1000);
  const adapter = createAdapter({}, { clock, open: true, host: 'ws://fake', WS: FakeWS });
  await adapter.connect(); await adapter.seat({});
  const r = await adapter.send([{ cmd: 'move', units: [1], x: 1, z: 0 }, { cmd: 'move', units: [1], x: 2, z: 0 }, { cmd: 'move', units: [1], x: 3, z: 0 }]);
  assert.deepEqual(r.map(x => x.ok), [true, false, true]);
  assert.match(r[1].error, /transport: socket write failed/);
});

// Review 2026-09-14 regressions (docs/reviews/2026-09-14-full.md S1 item 1, S2 item 10).
// Probe 3: --stream's unconditional close send([],{partial:false}) pushes an empty entry into `recent`,
// evicting real decisions from the 2-decision repeat window; and two overlapping streamed decisions
// share the single `open` flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAdapter } from '../../../src/games/ashfall/index.mjs';
import { virtualClock } from '../../../src/core/clock.mjs';

class FakeWS extends EventEmitter {
  static OPEN = 1; static all = []; static script = {};
  constructor(url, opts) { super(); this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this);
    queueMicrotask(() => { if (this.readyState !== 0) return; this.readyState = 1; this.emit('open'); this.push({ type: 'hello', player: null }); }); }
  push(obj) { this.emit('message', Buffer.from(JSON.stringify(obj))); }
  send(s) { const m = JSON.parse(s); this.sent.push(m); const r = FakeWS.script.reply?.(m, this); if (r) queueMicrotask(() => this.push({ type: 'result', id: m.id, ...r })); }
  terminate() { if (this.readyState === 3) return; this.readyState = 3; queueMicrotask(() => this.emit('close')); }
  close() { this.terminate(); }
}
const ok = result => ({ ok: true, result });
const baseReply = m => (m.type === 'register' ? ok({ id: 'p1' }) : m.type === 'create' || m.type === 'join' ? ok({ game: { id: 5 }, team: 0 }) : m.type === 'games' ? ok({ games: [] }) : ok({}));

const mk = async () => {
  FakeWS.all = []; FakeWS.script = { reply: baseReply };
  const clock = virtualClock(1000);
  const a = createAdapter({}, { clock, open: true, host: 'ws://fake', WS: FakeWS });
  await a.connect(); await a.seat({});
  return a;
};
// expand() sees `recent`; a sticky repeat is dropped. Use it to read the window.
const B = n => ({ cmd: 'research', building: n });
const state = { native: { mine: [], buildings: [] } };
const isRepeat = (a, c) => a.expand([c], state, state, []).dropped.some(d => d.reason === 'repeat');

test('P3a: two streamed no-op decisions flush a real decision out of the repeat window', async () => {
  const a = await mk();
  await a.send([B(1)], { partial: true }); await a.send([], { partial: false });   // decision 1 streamed one sticky cmd
  assert.equal(isRepeat(a, B(1)), true, 'right after decision 1 it is a repeat');
  await a.send([], { partial: false });   // decision 2: the model answered with no orders (--stream closes anyway)
  await a.send([], { partial: false });   // decision 3: same
  console.log('after two no-op decisions, B(1) still remembered:', isRepeat(a, B(1)));
  assert.equal(isRepeat(a, B(1)), true, 'a 2-decision window must survive two no-op decisions');
});

test('P3b: overlapping streamed decisions share one `open` flag', async () => {
  const a = await mk();
  await a.send([B(1)], { partial: true });    // decision A chunk 1
  await a.send([B(2)], { partial: true });    // decision B chunk 1 (overlap 2) -> merged into A's entry
  await a.send([], { partial: false });       // A closes -> open=false, though B is still streaming
  await a.send([B(3)], { partial: true });    // B chunk 2 -> starts a NEW entry, so B spans two window slots
  await a.send([], { partial: false });       // B closes
  console.log('B(1) remembered:', isRepeat(a, B(1)), 'B(2):', isRepeat(a, B(2)), 'B(3):', isRepeat(a, B(3)));
  assert.equal(isRepeat(a, B(1)), true, 'only two decisions happened; both should still be in the window');
});

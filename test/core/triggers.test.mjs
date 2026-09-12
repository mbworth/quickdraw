import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTriggers } from '../../src/core/triggers.mjs';
import { virtualClock } from '../../src/core/clock.mjs';

const classes = ['danger', 'contact', 'idle', 'info'];
const mk = (over = {}) => {
  const clock = virtualClock();
  const fires = [];
  const tr = createTriggers({ classes, cooldownMs: { danger: 2000 }, heartbeatMs: 3000, refreshMs: 500, deadlineMarginMs: 1000, clock, onFire: r => fires.push(r), ...over });
  return { clock, tr, fires };
};
const ev = (cls, key, t = 0) => ({ cls, key, t });

test('one tick batches to one ranked fire', () => {
  const { tr } = mk();
  const r = tr.tick({ events: [ev('info', 'a'), ev('danger', 'b'), ev('contact', 'c'), ev('info', 'a')] });
  assert.deepEqual(r.fire.map(x => x.cls), ['danger', 'contact', 'info']);
  assert.equal(r.fire[2].count, 2);
  assert.equal(r.outcomes.filter(o => o.outcome === 'fired').length, 3);
});

test('cooldown holds a repeated key and a new key breaks through', async () => {
  const { tr, clock } = mk();
  assert.ok(tr.tick({ events: [ev('danger', 'a')] }).fire);
  await clock.advance(500);
  const r = tr.tick({ events: [ev('danger', 'a', 500), ev('danger', 'b', 500)] });
  assert.deepEqual(r.outcomes.map(o => [o.key, o.outcome]), [['a', 'cooldown'], ['b', 'fired']]);
  assert.deepEqual(r.fire.map(x => x.key), ['b']);
  await clock.advance(2000);
  assert.ok(tr.tick({ events: [ev('danger', 'a', 2500)] }).fire);
});

test('heartbeat runs from decision start; overdue fires once at done', async () => {
  const { tr, clock, fires } = mk();
  tr.tick({});
  tr.markStart();
  await clock.advance(3500);
  assert.equal(fires.length, 0);
  tr.markDone();
  assert.equal(fires.length, 1);
  assert.equal(fires[0].fire[0].cls, 'heartbeat');
  tr.markDone();
  assert.equal(fires.length, 1);
  tr.markStart(); tr.markDone();
  await clock.advance(2999); assert.equal(fires.length, 1);
  await clock.advance(1); assert.equal(fires.length, 2);
});

test('while states flow, a due heartbeat rides the next tick so its packet is fresh; when they stop, the timer fires', async () => {
  const { tr, clock, fires } = mk({ heartbeatMs: 2700 });
  const ticks = [];
  for (let t = 0; t <= 3000; t += 500) ticks.push(clock.setTimeout(() => { const r = tr.tick({}); if (r.fire) fires.push(r); }, t));
  await clock.advance(120); tr.markStart(); tr.markDone();   // decision at 120: due at 2820, the 3000 tick carries it
  await clock.advance(2879); assert.equal(fires.length, 0);
  await clock.advance(1); assert.equal(fires.length, 1);
  assert.equal(fires[0].fire[0].cls, 'heartbeat'); assert.equal(fires[0].fire[0].t, 3000);
  tr.markStart(); tr.markDone();   // 3000: due at 5700, ticks stopped, so the fallback timer fires within 2 refreshes
  await clock.advance(2699); assert.equal(fires.length, 1);
  await clock.advance(1001); assert.equal(fires.length, 2);
});

test('a suppressed heartbeat reschedules itself: cannot-act does not kill liveness', async () => {
  const { tr, clock, fires } = mk();
  tr.tick({ canAct: false });
  tr.start();
  await clock.advance(3000);
  assert.equal(fires.length, 1); assert.equal(fires[0].fire, null); assert.equal(fires[0].outcomes[0].outcome, 'suppressed:cannot-act');
  await clock.advance(3000);
  assert.equal(fires.length, 2, 'still ticking while unable to act');
  tr.tick({ canAct: true });
  await clock.advance(3000);
  assert.ok(fires[2].fire, 'fires once we can act');
});

test('cannot-act suppresses everything but the deadline fire', async () => {
  const { tr, clock, fires } = mk();
  const r = tr.tick({ events: [ev('danger', 'a'), ev('info', 'b')], canAct: false, deadline: { atMs: 5000, cls: 'turn' } });
  assert.equal(r.fire, null);
  assert.deepEqual(r.outcomes.map(o => o.outcome), ['suppressed:cannot-act', 'suppressed:cannot-act']);
  await clock.advance(3999); assert.equal(fires.length, 0);
  await clock.advance(1);
  assert.equal(fires.length, 1);
  assert.equal(fires[0].fire[0].cls, 'deadline');
  assert.equal(fires[0].fire[0].key, 'turn');
  tr.tick({ canAct: false, deadline: { atMs: 5000, cls: 'turn' } });
  await clock.advance(5000);
  assert.equal(fires.length, 1, 'the same deadline never fires twice');
});

test('dirty re-entry goes through cooldown and the refresh floor', async () => {
  const { tr, clock } = mk();
  assert.ok(tr.tick({ events: [ev('danger', 'a')] }).fire);
  tr.markStart();
  await clock.advance(100);
  const r = tr.tick({ events: [ev('contact', 'c', 100), ev('idle', 'u1', 100)] });
  assert.equal(r.fire, null);
  assert.deepEqual(r.outcomes.map(o => o.outcome), ['coalesced', 'coalesced']);
  const dirty = tr.takeDirty();
  assert.deepEqual(dirty.map(x => x.key), ['c', 'u1']);
  assert.equal(tr.takeDirty(), null);
  assert.equal(tr.floorDelayMs(), 400);
  const re = tr.reoffer([...dirty, ev('danger', 'a', 100)]);
  assert.deepEqual(re.outcomes.map(o => [o.key, o.outcome]), [['a', 'cooldown'], ['c', 'fired'], ['u1', 'fired']]);
  assert.deepEqual(re.fire.map(x => x.key), ['c', 'u1']);
});

test('dirty keeps the highest ranked set across ticks', () => {
  const { tr } = mk();
  tr.markStart();
  tr.tick({ events: [ev('info', 'x')] });
  tr.tick({ events: [ev('contact', 'c'), ev('info', 'x')] });
  const d = tr.takeDirty();
  assert.deepEqual(d.map(x => [x.cls, x.count]), [['contact', 1], ['info', 2]]);
});

test('suspend records disconnected and resume forces one fire', () => {
  const { tr } = mk();
  tr.suspend();
  const r = tr.tick({ events: [ev('danger', 'a')] });
  assert.equal(r.fire, null);
  assert.equal(r.outcomes[0].outcome, 'suppressed:disconnected');
  tr.resume();
  const f = tr.tick({});
  assert.equal(f.fire.length, 1);
  assert.equal(f.fire[0].cls, 'resume');
  assert.equal(tr.tick({}).fire, null);
});

test('derived triggers fire once per crossing and re-arm when absent', () => {
  const { tr } = mk();
  const d = [{ cls: 'idle', key: 'b1' }];
  assert.equal(tr.tick({ derived: d }).fire.length, 1);
  assert.equal(tr.tick({ derived: d }).fire, null);
  assert.equal(tr.tick({ derived: [] }).fire, null);
  assert.equal(tr.tick({ derived: d }).fire.length, 1);
  tr.resume();
  assert.equal(tr.tick({ derived: d }).fire.length, 2, 'resume clears edge memory');
});

test('every outcome carries the arrival t', () => {
  const { tr } = mk();
  const r = tr.tick({ events: [ev('info', 'a', 42)] });
  assert.equal(r.outcomes[0].t, 42);
});

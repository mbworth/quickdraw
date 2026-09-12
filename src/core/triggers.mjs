// Trigger engine: batching, cooldowns, edge detection, coalescing, heartbeat, deadlines. Game-agnostic.
import { rankAndCollapse, rankOf } from './digest.mjs';

export const CORE_CLS = { deadline: 'deadline', heartbeat: 'heartbeat', resume: 'resume' };
export const isCore = cls => cls === CORE_CLS.deadline || cls === CORE_CLS.heartbeat || cls === CORE_CLS.resume;

// maxInFlight > 1 lets a ranked trigger start another call while one is in flight (heartbeats and resumes never do).
export function createTriggers({ classes, cooldownMs = {}, heartbeatMs = 3000, refreshMs = 0, deadlineMarginMs = 1000, maxInFlight = 1, clock, onFire }) {
  const rank = tr => tr.cls === CORE_CLS.deadline ? -1 : tr.cls === CORE_CLS.heartbeat || tr.cls === CORE_CLS.resume ? classes.length : rankOf(tr, classes);
  const st = {
    inFlight: 0, dirty: null, lastStartT: -Infinity, lastTickT: -Infinity, suspended: false, forceNext: false,
    lastFire: new Map(), derivedActive: new Set(), hbTimer: null, hbDue: false, dlTimer: null, dlAt: null,
    lastCanAct: true,
  };
  const outcomeOf = (tr, outcome) => ({ cls: tr.cls, key: tr.key, t: tr.t, outcome, count: tr.count });
  const hbCand = () => ({ cls: CORE_CLS.heartbeat, key: 'hb', t: clock.now() });
  // States are flowing: the next tick carries a due heartbeat, so its packet is built from a fresh snapshot.
  const ticking = () => refreshMs > 0 && clock.now() - st.lastTickT <= 2 * refreshMs;

  function resolve(cands, { canAct = true, reoffer = false } = {}) {
    const outcomes = [];
    const now = clock.now();
    if (st.suspended) return { fire: null, outcomes: cands.map(tr => outcomeOf(tr, 'suppressed:disconnected')) };
    const ranked = rankAndCollapse(cands, { classes }).sort((a, b) => rank(a) - rank(b) || a.t - b.t);
    const survivors = [];
    for (const tr of ranked) {
      if (!canAct && tr.cls !== CORE_CLS.deadline) { outcomes.push(outcomeOf(tr, 'suppressed:cannot-act')); continue; }
      const cd = cooldownMs[tr.cls] || 0;
      const last = st.lastFire.get(tr.cls + '\0' + tr.key);
      if (cd > 0 && last !== undefined && now - last < cd) { outcomes.push(outcomeOf(tr, 'cooldown')); continue; }
      survivors.push(tr);
    }
    if (!survivors.length) return { fire: null, outcomes };
    const idleOnly = survivors.every(tr => tr.cls === CORE_CLS.heartbeat || tr.cls === CORE_CLS.resume);
    if (st.inFlight > 0 && !reoffer && (st.inFlight >= maxInFlight || idleOnly)) {
      st.dirty = rankAndCollapse([...(st.dirty || []), ...survivors], { classes }).sort((a, b) => rank(a) - rank(b) || a.t - b.t);
      for (const tr of survivors) outcomes.push(outcomeOf(tr, 'coalesced'));
      return { fire: null, outcomes };
    }
    for (const tr of survivors) { st.lastFire.set(tr.cls + '\0' + tr.key, now); outcomes.push(outcomeOf(tr, 'fired')); }
    return { fire: survivors, outcomes };
  }

  function scheduleDeadline(deadline) {
    const at = deadline ? deadline.atMs : null;
    if (at === st.dlAt) return;
    if (st.dlTimer !== null) { clock.clearTimeout(st.dlTimer); st.dlTimer = null; }
    st.dlAt = at;
    if (at === null) return;
    const cls = deadline.cls;
    st.dlTimer = clock.setTimeout(() => {
      st.dlTimer = null;   // dlAt stays: the same deadline never fires twice
      onFire(resolve([{ cls: CORE_CLS.deadline, key: cls, t: clock.now() }], { canAct: true }));
    }, Math.max(0, at - deadlineMarginMs - clock.now()));
  }

  function tick({ events = [], derived = [], canAct = true, deadline = null } = {}) {
    const now = clock.now();
    st.lastCanAct = canAct; st.lastTickT = now;
    const cands = events.map(ev => ({ ...ev, t: ev.t ?? now }));
    const seen = new Set();
    for (const d of derived) {
      const k = d.cls + '\0' + d.key; seen.add(k);
      if (!st.derivedActive.has(k)) { st.derivedActive.add(k); cands.push({ ...d, t: d.t ?? now, derived: true }); }
    }
    for (const k of st.derivedActive) if (!seen.has(k)) st.derivedActive.delete(k);
    if (!st.suspended) scheduleDeadline(deadline);
    if (st.forceNext && !st.suspended && canAct) { st.forceNext = false; cands.push({ cls: CORE_CLS.resume, key: 'resume', t: now }); }
    const hb = st.hbDue && !st.inFlight && !st.suspended;
    if (hb) { st.hbDue = false; cands.push(hbCand()); }
    const r = resolve(cands, { canAct });
    if (hb && !r.fire) scheduleHeartbeat();   // a suppressed heartbeat still keeps the clock running
    return r;
  }

  function reoffer(triggers, { canAct = true } = {}) { return resolve(triggers, { canAct, reoffer: true }); }

  function scheduleHeartbeat(ms = heartbeatMs) {
    if (st.hbTimer !== null) clock.clearTimeout(st.hbTimer);
    st.hbTimer = clock.setTimeout(() => {
      st.hbTimer = null; st.hbDue = true;
      if (st.inFlight) return;   // markDone picks it up
      if (ticking()) scheduleHeartbeat(2 * refreshMs);   // the next tick fires it; this is the fallback if ticks stop
      else fireHeartbeat();
    }, ms);
  }
  function fireHeartbeat() {
    st.hbDue = false;
    if (st.suspended) return;
    const r = resolve([hbCand()], { canAct: st.lastCanAct });
    onFire(r);
    if (!r.fire && !st.inFlight) scheduleHeartbeat();
  }

  return {
    tick, reoffer,
    markStart() { st.inFlight++; this.touch(); },   // once per decision; later calls of the same decision (retry, reoffer) touch()
    touch() { st.hbDue = false; st.lastStartT = clock.now(); scheduleHeartbeat(); },
    markDone() {
      st.inFlight = Math.max(0, st.inFlight - 1);
      if (!st.inFlight && st.hbDue && !ticking()) fireHeartbeat();   // else the next tick carries it
    },
    takeDirty() { const d = st.dirty; st.dirty = null; return d; },
    floorDelayMs() { return Math.max(0, st.lastStartT + refreshMs - clock.now()); },
    suspend() {
      st.suspended = true; st.dirty = null; st.hbDue = false;
      if (st.hbTimer !== null) { clock.clearTimeout(st.hbTimer); st.hbTimer = null; }
      scheduleDeadline(null);
    },
    resume() { st.suspended = false; st.derivedActive.clear(); st.lastFire.clear(); st.forceNext = true; if (!st.inFlight) scheduleHeartbeat(); },
    start() { scheduleHeartbeat(); },
    stop() { if (st.hbTimer !== null) clock.clearTimeout(st.hbTimer); st.hbTimer = null; st.hbDue = false; st.dirty = null; scheduleDeadline(null); },
    get inFlight() { return st.inFlight; },
    get suspended() { return st.suspended; },
  };
}

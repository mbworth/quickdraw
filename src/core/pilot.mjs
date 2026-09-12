// The loop: triggers → encode → assemble → model → expand → validate → send → record. Knows no game.
import fs from 'node:fs';
import { createTriggers, isCore } from './triggers.mjs';
import { assemble } from './packet.mjs';

const wait = (clock, ms) => new Promise(r => (ms > 0 ? clock.setTimeout(r, ms) : r()));

export function exitCodeOf(done) {
  if (!done) return 1;
  if (done.outcome?.won === true) return 0;
  if (done.outcome?.draw === true) return 3;
  return 1;
}

// expand → cap → validate → stale check. The pilot and the rehearsal play this same pipeline.
export function applyOrders({ adapter, orders, state, decidedOn = state, staleAfterMs = Infinity, clock }) {
  const t0 = clock.now(), dropped = [], cap = adapter.meta.orderCap;
  let { cmds, dropped: d1 } = adapter.expand(orders, state, decidedOn); dropped.push(...d1);   // decidedOn: the state the packet came from, for pasted labels
  if (cmds.length > cap) { for (const c of cmds.slice(cap)) dropped.push({ cmd: c, reason: 'cap' }); cmds = cmds.slice(0, cap); }
  const expandMs = clock.now() - t0;
  let { keep, dropped: d2 } = adapter.validate(cmds, state); dropped.push(...d2);
  const gt = decidedOn.header.clocks?.game, gtNow = state.header.clocks?.game;
  const age = gt !== undefined && gtNow !== undefined ? (gtNow - gt) * 1000 : state.t - decidedOn.t;
  if (state.header.lifecycle !== 'active' || age > staleAfterMs) { for (const c of keep) dropped.push({ cmd: c, reason: 'stale' }); keep = []; }
  return { keep, dropped, expandMs, validateMs: clock.now() - t0 - expandMs };
}
export const lastOrdersOf = (keep, results, dropped) =>
  keep.map((c, i) => ({ cmd: c, ...(results[i] || { ok: false, error: 'no result' }) })).concat(dropped.map(d => ({ cmd: d.cmd, ok: false, error: `dropped:${d.reason}` })));

export async function runPilot({ adapter, callModel, clock, record = null, opts = {}, log = () => {}, stop = null }) {
  const o = {
    heartbeatMs: 3000, deadlineMarginMs: 1000, packetMax: 600, divisor: 3.5, fullEvery: 0, staleAfterMs: 8000,
    maxUsd: Infinity, maxDecisions: Infinity, concedeOn: 'never', stopFile: null, stopPollMs: 500, leaveTimeoutMs: 2000, ...opts,
  };
  const meta = adapter.meta;
  const rec = record || { writeNow: () => -1, writeState: () => null, ensureState: () => null, flushAndClose() {} };

  let latest = null, prevDecisionState = null, prevDecisionRef = null, idx = 0, eventsSince = [], resumeT = -Infinity;
  let lastOrders = [], decisions = 0, usd = 0, started = false, budgetStopped = false, deciding = false;
  let finished = null, finishResolve, abortDecision = null, stopTimer = null, endTimer = null;
  const finishedP = new Promise(r => (finishResolve = r));

  const trig = createTriggers({
    classes: meta.classes, cooldownMs: meta.cooldownMs || {}, heartbeatMs: o.heartbeatMs, refreshMs: meta.refreshMs || 0,
    deadlineMarginMs: o.deadlineMarginMs, clock, onFire: handle,
  });

  function recordOutcomes(r, extra = {}) {
    if (r.fire) r.fire.tickT = clock.now();
    if (!r.outcomes.length) return -1;
    const n = rec.writeNow('trigger', { outcomes: r.outcomes, ...extra });
    if (r.fire) for (const tr of r.fire) tr.ref = n;
    return n;
  }
  function handle(r) {
    recordOutcomes(r, r.fire ? { fireN: decisions + 1 } : {});
    if (r.fire && !deciding && !finished && !budgetStopped) decide(r.fire).catch(e => { log('decide failed', e); rec.writeNow('crash', { kind: 'decide', error: String(e?.stack || e) }); });
  }

  function finish(done, why) {
    if (finished) return;
    finished = { done, why };
    trig.stop();
    if (stopTimer !== null) clock.clearInterval(stopTimer);
    if (endTimer !== null) clock.clearTimeout(endTimer);
    abortDecision?.abort();
    rec.writeNow('done', { ...done, why: done?.why || why, decisions, usd });
    finishResolve();
  }

  adapter.on('state', snap => {
    if (finished) return;
    snap.idx = ++idx; if (snap.t === undefined) snap.t = clock.now();
    latest = snap;
    rec.writeState(snap);
    const life = snap.header.lifecycle;
    if (life !== 'active') {
      if (life === 'pregame' && !started) { started = true; Promise.resolve(adapter.start()).catch(e => log('start failed', e)); }
      else if (life === 'ended' && endTimer === null) endTimer = clock.setTimeout(() => finish({ outcome: {}, why: 'ended' }, 'state:ended'), meta.refreshMs || 500);   // give the adapter's done (with the outcome) one refresh to arrive
      handle(trig.tick({ canAct: false }));   // the heartbeat must not buy calls while we cannot act
      return;
    }
    const derived = adapter.derive(snap) || [];
    const canAct = adapter.canAct(snap);
    const deadline = adapter.deadline(snap);
    const events = eventsSince; eventsSince = [];
    handle(trig.tick({ events, derived, canAct, deadline }));
  });
  adapter.on('event', ev => { if (!finished) eventsSince.push({ ...ev, t: Math.max(ev.t ?? clock.now(), resumeT) }); });   // an event buffered through an outage counts from the reconnect
  adapter.on('done', d => finish(d, 'done'));
  adapter.on('close', () => finish({ outcome: {}, why: 'transport' }, 'transport'));
  adapter.on('disconnect', () => { trig.suspend(); rec.writeNow('disconnect', {}); });
  adapter.on('reconnect', () => { trig.resume(); resumeT = clock.now(); prevDecisionState = null; prevDecisionRef = null; rec.writeNow('reconnect', {}); });
  stop?.addEventListener('abort', () => finish({ outcome: {}, why: 'signal' }, 'signal'), { once: true });

  function budgetHit() {
    if (decisions >= o.maxDecisions) return `decisions ${decisions} >= ${o.maxDecisions}`;
    const projected = usd + (decisions ? usd / decisions : 0);
    if (projected >= o.maxUsd) return `usd ${projected.toFixed(4)} >= ${o.maxUsd}`;
    return null;
  }

  async function decide(set) {
    deciding = true;
    let retried = false;
    try {
      while (!finished) {
        const why = budgetHit();
        if (why) {
          budgetStopped = true; trig.takeDirty(); rec.writeNow('budget-stop', { why, decisions, usd });
          if (o.concedeOn === 'budget') Promise.resolve(adapter.concede()).catch(e => log('concede failed', e));
          break;
        }
        const startT = clock.now();
        trig.markStart();
        const snap = latest;
        if (!snap) break;   // a heartbeat before the first state
        const n = decisions + 1;
        const stateRef = rec.ensureState(snap);
        const evs = set.filter(tr => !tr.derived && !isCore(tr.cls));   // reaction time is anchored on real events only
        const anchor = evs.length ? 'event' : 'tick';
        const eventArrivalT = Math.min(...(evs.length ? evs : set).map(tr => tr.t));
        const tickT = set.tickT ?? startT;
        const T = { waitMs: tickT - eventArrivalT, queueMs: startT - tickT }; let t0 = startT;
        const layers = adapter.encode({ state: snap, prevDecisionState, triggers: set, lastOrders });
        const pkt = assemble(layers, { maxTokens: o.packetMax, divisor: o.divisor, fullEvery: o.fullEvery, n });
        T.encodeMs = clock.now() - t0; t0 = clock.now();
        abortDecision = new AbortController();
        const res = await callModel({ packet: pkt.text, signal: abortDecision.signal });
        abortDecision = null;
        T.apiMs = clock.now() - t0; t0 = clock.now();
        usd += res.cost || 0;
        const callBase = {
          n, stateRef, prevDecisionRef, triggerRefs: [...new Set(set.map(tr => tr.ref).filter(x => x >= 0))],
          triggers: set.map(({ cls, key, t, count, urgency, native, gt, derived }) => ({ cls, key, t, count, urgency, native, gt, derived })),
          lastOrders, packet: pkt.text,
          packetMeta: { kept: pkt.kept, dropped: pkt.dropped, estTokens: pkt.estTokens, realTokens: res.usage && res.usage.cache_read_input_tokens > 0 ? res.usage.input_tokens : null },
          usage: res.usage, stop: res.stop, error: res.error, note: res.note, eventArrivalT, anchor,
        };
        if (finished) { rec.writeNow('call', { ...callBase, latency: { ...T, totalMs: clock.now() - eventArrivalT }, skipped: 'ended' }); break; }
        const failed = res.stop !== 'tool_use';
        if (failed) {
          const dirty = trig.takeDirty();
          const canRetry = !retried && res.stop !== 'refusal' && res.stop !== 'max_tokens';
          const skipped = res.stop === 'max_tokens' ? 'truncated' : res.stop === 'refusal' ? 'refusal' : dirty ? 'dirty' : canRetry ? 're-encode' : 'failed';
          rec.writeNow('call', { ...callBase, latency: { ...T, totalMs: clock.now() - eventArrivalT }, skipped });
          decisions++;
          if (dirty) { set = await reofferOrNull(dirty); if (!set) break; retried = false; continue; }
          if (canRetry) { retried = true; continue; }
          break;
        }
        retried = false;
        const orders = res.act ? res.orders : [];
        const { keep, dropped, expandMs, validateMs } = applyOrders({ adapter, orders, state: latest, decidedOn: snap, staleAfterMs: o.staleAfterMs, clock });
        T.expandMs = expandMs; T.validateMs = validateMs; t0 = clock.now();
        let results = [];
        if (keep.length) { try { results = await adapter.send(keep); } catch (e) { results = keep.map(() => ({ ok: false, error: `transport: ${e.message}` })); } }
        T.sendMs = clock.now() - t0;
        T.totalMs = clock.now() - eventArrivalT;
        lastOrders = lastOrdersOf(keep, results, dropped);
        const callRef = rec.writeNow('call', { ...callBase, latency: T });
        rec.writeNow('decision', { n, callRef, act: res.act, orders, sent: keep, dropped });
        rec.writeNow('result', { n, results });
        decisions++;
        prevDecisionState = snap; prevDecisionRef = stateRef;
        const dirty = trig.takeDirty();
        if (!dirty) break;
        set = await reofferOrNull(dirty);
        if (!set) break;
      }
    } finally {
      deciding = false;
      abortDecision = null;
      trig.markDone();
    }
  }
  async function reofferOrNull(dirty) {
    await wait(clock, trig.floorDelayMs());
    if (finished || !latest) return null;
    const r = trig.reoffer(dirty, { canAct: adapter.canAct(latest) });
    recordOutcomes(r, r.fire ? { fireN: decisions + 1, reoffer: true } : { reoffer: true });
    return r.fire;
  }

  if (o.stopFile) stopTimer = clock.setInterval(() => { if (fs.existsSync(o.stopFile)) finish({ outcome: {}, why: 'stop-file' }, 'stop-file'); }, o.stopPollMs);
  trig.start();

  await finishedP;
  while (deciding) await wait(clock, 10);
  try { await Promise.race([adapter.leave(), wait(clock, o.leaveTimeoutMs)]); } catch (e) { log('leave failed', e); }
  const done = finished.done;
  const exitCode = finished.why === 'stop-file' ? 2 : finished.why === 'signal' ? 130 : exitCodeOf(done);
  return { done, exitCode, decisions, usd };
}

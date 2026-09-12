// Data-driven fake game for core tests. Deliberately unlike an RTS: turn-based with a per-turn deadline,
// single action, draw-capable, no game clock. Runs on the injected clock; send never moves the world.
import { EventEmitter } from 'node:events';
import { diffById } from '../../core/digest.mjs';
import { tool } from './tool.mjs';

export const meta = Object.freeze({
  name: 'mock', classes: ['turn', 'opponent', 'info'], cooldownMs: { info: 1000 }, orderCap: 1, actionMode: 'single',
  toolName: 'move', toolDescription: 'Move one piece (cmd move id to) or pass. act:false when nothing to do.', refreshMs: 100,
});

// Default timeline: `turns` turns of 1000 ms; my phase 0-600 with a deadline at +600, opponent phase after.
export function defaultTimeline({ seed = 1, turns = 3, turnMs = 1000 } = {}) {
  const tl = [];
  for (let k = 1; k <= turns; k++) {
    const t = (k - 1) * turnMs;
    tl.push([t, 'event', { cls: 'turn', key: `t${k}` }]);
    tl.push([t, 'state', { turn: k, phase: 'me', deadlineIn: 600 }]);
    tl.push([t + 600, 'state', { turn: k, phase: 'opp', deadlineIn: null }]);
    tl.push([t + 700, 'event', { cls: 'opponent', key: `m${k}`, native: { piece: 2, to: 10 + k } }]);
    tl.push([t + 700, 'move', { id: 2, pos: 10 + k }]);
    if (k % 2 === 0) tl.push([t + 750, 'event', { cls: 'info', key: 'chat', native: { text: 'gg' } }]);
  }
  const end = turns * turnMs;
  const outcome = seed % 3 === 0 ? { draw: true } : { won: seed % 2 === 1 };
  tl.push([end, 'done', { outcome, why: outcome.draw ? 'stalemate' : outcome.won ? 'checkmate' : 'resigned' }]);
  return tl;
}

export function createAdapter(env, opts = {}) {
  const clock = opts.clock;
  if (!clock) throw new Error('mock adapter needs opts.clock');
  const seed = opts.seed ?? 1;
  const timeline = opts.timeline || defaultTimeline({ seed, turns: opts.turns, turnMs: opts.turnMs });
  const faults = opts.faults || [];
  const em = new EventEmitter();
  const world = { turn: 0, phase: 'pregame', pieces: [{ id: 1, owner: 'me', pos: 0 }, { id: 2, owner: 'opp', pos: 10 }, { id: 3, owner: 'me', pos: 1 }], score: { me: 0, opp: 0 } };
  const gameId = `mock-${seed}`, seat = 'me';
  let t0 = 0, deadlineAt = null, over = false, endedOnly = false, rejectNext = false, connected = true, pushTimer = null, timers = [];
  const sent = [];

  const header = () => ({ lifecycle: world.phase === 'pregame' ? 'pregame' : over || endedOnly ? 'ended' : 'active', phaseNative: world.phase, gameId, seat });
  const snapshot = () => ({ header: header(), native: structuredClone({ ...world, deadlineAt }), t: clock.now() });
  const push = () => { if (connected) em.emit('state', snapshot()); };
  const at = (ms, fn) => timers.push(clock.setTimeout(fn, Math.max(0, t0 + ms - clock.now())));

  const adapter = {
    meta, tool, sent,
    on: (ev, fn) => em.on(ev, fn),
    async connect() {},
    async seat() { at(0, push); return { gameId, seat }; },
    async start() {
      t0 = clock.now();
      for (const [ms, kind, p] of timeline) at(ms, () => {
        if (over || (endedOnly && kind !== 'done')) return;
        if (kind === 'state') { world.turn = p.turn; world.phase = p.phase; deadlineAt = p.deadlineIn == null ? null : clock.now() + p.deadlineIn; push(); }
        else if (kind === 'event') { if (connected) em.emit('event', { ...p, t: clock.now() }); }
        else if (kind === 'move') { const pc = world.pieces.find(x => x.id === p.id); if (pc) pc.pos = p.pos; }
        else if (kind === 'end') { world.phase = 'over'; endedOnly = true; push(); }   // an ended state with no done yet (the adapter is slow to say who won)
        else if (kind === 'done') { over = true; world.phase = 'over'; em.emit('done', { outcome: p.outcome, duration: clock.now() - t0, why: p.why }); }
      });
      for (const f of faults) at(f.at, () => {
        if (f.kind === 'disconnect') { connected = false; em.emit('disconnect'); at(f.at + (f.forMs ?? 300), () => { connected = true; em.emit('reconnect'); push(); }); }
        else if (f.kind === 'rejectCmd') rejectNext = true;
        else if (f.kind === 'doneMidCall') { over = true; world.phase = 'over'; em.emit('done', { outcome: { draw: true }, duration: clock.now() - t0, why: 'aborted' }); }
        else if (f.kind === 'deadline') { deadlineAt = clock.now() + (f.inMs ?? 1500); push(); }
        else if (f.kind === 'close') { connected = false; em.emit('close', new Error('transport')); }
      });
      pushTimer = clock.setInterval(push, meta.refreshMs);
    },
    async leave() { if (pushTimer !== null) clock.clearInterval(pushTimer); for (const t of timers) clock.clearTimeout(t); },
    async concede() { over = true; world.phase = 'over'; em.emit('done', { outcome: { won: false }, why: 'concede' }); },
    canAct: s => s.header.lifecycle === 'active' && s.header.phaseNative === 'me',
    deadline: s => (s.header.phaseNative === 'me' && s.native.deadlineAt != null ? { atMs: s.native.deadlineAt, cls: 'turn' } : null),
    derive: s => (s.header.phaseNative === 'me' && s.native.pieces.some(p => p.owner === 'me' && p.pos === 0) ? [{ cls: 'info', key: 'home' }] : []),
    encode({ state, prevDecisionState, triggers, lastOrders }) {
      const n = state.native;
      const layers = [{ name: 'header', priority: 0, text: `T${n.turn} ${n.phase} ${n.score.me}:${n.score.opp}` }];
      const d = prevDecisionState ? diffById(prevDecisionState.native, n, { lists: [{ name: 'pieces', path: 'pieces' }] }).pieces : null;
      const dl = d ? [...d.added.map(p => `+${p.id}@${p.pos}`), ...d.removed.map(p => `-${p.id}`), ...d.changed.map(c => `${c.next.id}:${c.prev.pos}>${c.next.pos}`)] : [];
      layers.push({ name: 'delta', priority: 0, text: 'Δ ' + (dl.length ? dl.join(' ') : 'none') });
      layers.push({ name: 'triggers', priority: 1, text: '! ' + triggers.map(t => `${t.cls}:${t.key}${t.count > 1 ? 'x' + t.count : ''}`).join(' ') });
      layers.push({ name: 'pieces', priority: 2, text: 'P', lines: n.pieces.map(p => ({ text: `${p.owner === 'me' ? 'm' : 'o'}#${p.id}@${p.pos}`, priority: p.owner === 'me' ? 1 : 2 })) });
      layers.push({ name: 'last', priority: 0, text: 'L ' + (lastOrders.length ? lastOrders.map(o => `${o.cmd.cmd}${o.cmd.id ?? ''} ${o.ok ? 'ok' : o.error}`).join('; ') : '-') });
      return layers;
    },
    expand(cmds) {
      const out = [], dropped = [];
      for (let c of cmds) {
        if (c.cmd === 'move' && typeof c.id === 'string') { const m = /^(?:p#)?(\d+)$/.exec(c.id); if (!m) { dropped.push({ cmd: c, reason: 'bad-id' }); continue; } c = { ...c, id: Number(m[1]) }; }
        out.push(c);
      }
      return { cmds: out, dropped };
    },
    validate(cmds, state) {
      const keep = [], dropped = [];
      for (const c of cmds) {
        if (c.cmd === 'move' && !state.native.pieces.some(p => p.owner === 'me' && p.id === c.id)) { dropped.push({ cmd: c, reason: 'no-such-piece' }); continue; }
        keep.push(c);
      }
      return { keep, dropped };
    },
    async send(cmds) {
      if (!connected) return cmds.map(() => ({ ok: false, error: 'disconnected' }));
      return cmds.map(c => { sent.push(c); if (rejectNext) { rejectNext = false; return { ok: false, error: 'rejected: scripted' }; } return { ok: true }; });
    },
  };
  return adapter;
}

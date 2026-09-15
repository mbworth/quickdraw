// MicroRTS adapter: wires the socket-AI transport, the standing-order buffer, coder, expand and validate behind
// the core contract. The engine drives one getAction per cycle and blocks on our reply, so the adapter owns the
// game's clock (proto.mjs) and the translation from goals to single steps (orders.mjs).
//
// The clone MICRORTS_LOCAL points at must carry `remote-game-utt.patch` (in this directory; `git apply` it from the
// quickdraw repo path, then rebuild). Stock launch_mode=CLIENT builds one UnitTypeTable for the AIs and a second for
// the board, and UnitAction.equals compares a produce's unitType by object identity, so no socket client and no
// ai.abstraction.*Rush opponent can ever train a unit. The patch hands Game the AIs' own table.

import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { createProto } from './proto.mjs';
import { createBuffer } from './orders.mjs';
import { ACT, DX, DY, compactUtt, etaOf, stateOf } from './rules.mjs';
import { CLASSES, COOLDOWN_MS, detect, derive } from './events.mjs';
import { encode } from './coder.mjs';
import { expand as expandCmds } from './expand.mjs';
import { validate } from './validate.mjs';
import { tool } from './tool.mjs';
import { decode } from './lang.mjs';
import { ABBR_TEXT } from './abbr.mjs';

// Divisor: chars per token, calibrated by test/games/microrts/calibration.test.mjs (countTokens over the fixtures).
export const divisor = (() => { try { return JSON.parse(fs.readFileSync(new URL('./calibration.json', import.meta.url), 'utf8')).divisor || 3.5; } catch { return 3.5; } })();
const GRAMMAR = 'Verbs: t <bldId> <unit> [n] produce; h <units> [nodeId] harvest and keep returning; m <units> <x>,<y> walk; a <units> <x>,<y>|<unitId> attack-move or hunt. Units are ids (#22), selectors (all idle wk li hv rg), or one cluster label pasted from A. An order STANDS until it finishes, so repeating it is free and costs nothing.';
export const meta = Object.freeze({
  name: 'microrts', classes: CLASSES, cooldownMs: COOLDOWN_MS, orderCap: 10, actionMode: 'batch', toolName: 'orders',
  toolDescription: `Issue standing orders as one line ("-" when nothing is worth ordering). ${GRAMMAR} ${ABBR_TEXT}`, refreshMs: 500,
});

export const toHeader = (n, lifecycle, gameId, seat) => ({
  lifecycle, phaseNative: lifecycle === 'active' ? 'running' : lifecycle === 'ended' ? 'over' : 'notStarted',
  clocks: { cycle: n?.cycle ?? 0 }, gameId, seat,
});

export function createAdapter(env = {}, opts = {}) {
  const clock = opts.clock;
  if (!clock) throw new Error('microrts adapter needs opts.clock');
  const log = opts.log || (() => {});
  const dir = opts.local || env.MICRORTS_LOCAL || null;
  const map = opts.map || 'maps/16x16/basesWorkers16x16.xml';
  const opponent = opts.opponent || 'ai.abstraction.WorkerRush';
  const cycleMs = opts.cycleMs ?? 100;
  const maxCycles = opts.maxCycles ?? 3000;
  const refreshMs = opts.refreshMs ?? meta.refreshMs;
  const em = new EventEmitter();
  const buf = createBuffer({ dropAfter: opts.dropAfter ?? 20 });

  let tt = null, native = null, lifecycle = 'pregame', gameId = null, seat = 0, doneEmitted = false, tick = null;
  const idleSince = new Map();
  let uttResolve; const uttReady = new Promise(r => { uttResolve = r; });

  // The engine sends the whole type table on connect; every cost, duration and range the adapter uses comes from
  // there and rides on each snapshot as `tt`, so encode/expand/validate stay pure over the recorded state.
  function materialize(gs, me) {
    const pgs = gs.pgs, cycle = gs.time;
    const acting = new Map((gs.actions || []).map(a => [a.ID, a]));
    const res = [];
    for (const p of pgs.players || []) res[p.ID] = p.resources;
    // goalOf: subject id → the standing order's verb, from the buffer (not the engine's per-cycle action). A harvester
    // walking to its node still reads engine state `move`; `goal` carries `harvest` alongside it, recorded unconditionally
    // so it rides on every state for --microrts-goal-state to render from (coder.mjs) and future recordings to replay.
    const goalOf = new Map(buf.goals().map(g => [g.kind === 'train' ? g.building : g.unit, g.kind]));
    const units = (pgs.units || []).map(u => {
      const a = acting.get(u.ID), act = a?.action || null;
      // `busy` means the engine will not let me redirect this unit. A TYPE_NONE does not count: PlayerAction.fillWithNones
      // hands every unit we did not mention an idle action of 10 cycles, and GameState.issue overwrites one freely. Reading
      // those as busy would hide a producer 9 cycles in 10 and drop most orders (game 1: the base never built a worker).
      const real = act && act.type !== ACT.NONE ? a : null;
      if (real) idleSince.delete(u.ID); else if (!idleSince.has(u.ID)) idleSince.set(u.ID, cycle);
      const o = {
        id: u.ID, type: u.type, player: u.player, x: u.x, y: u.y, hp: u.hitpoints, carry: u.resources,
        busy: !!real, st: real ? stateOf(act) : 'idle', eta: real ? Math.max(0, real.time + etaOf(tt, u.type, act) - cycle) : 0,
        idleFor: real ? 0 : cycle - idleSince.get(u.ID), goal: goalOf.get(u.ID) || null,
      };
      if (real && act.unitType) o.make = act.unitType;
      // The cell an in-flight move or produce will occupy. GameState.issue treats a second unit heading for the same cell
      // as a conflict and cancels one of them, even across cycles, so the buffer has to route around these.
      if (real && (act.type === ACT.MOVE || act.type === ACT.PRODUCE) && act.parameter >= 0) o.dest = { x: u.x + DX[act.parameter], y: u.y + DY[act.parameter] };
      return o;
    });
    const live = new Set(units.map(u => u.id));
    for (const k of idleSince.keys()) if (!live.has(k)) idleSince.delete(k);
    return { cycle, width: pgs.width, height: pgs.height, terrain: pgs.terrain, me, res, tt, units };
  }

  const snapshot = () => ({ header: toHeader(native, lifecycle, gameId, seat), native, t: clock.now() });
  const emitState = () => { if (native) em.emit('state', snapshot()); };

  const proto = createProto({
    port: opts.port ?? 9898, cycleMs, clock, log, spawnJava: opts.spawn !== false, dir, map, opponent, maxCycles,
    java: opts.java || env.MICRORTS_JAVA || 'java',
    onAction(gs, player) {
      if (!tt) return [];                       // no type table yet: nothing can be computed safely
      seat = player;
      const prev = native;
      const n = materialize(gs, player);
      for (const ev of detect(prev, n)) em.emit('event', { ...ev, t: clock.now() });
      native = n;
      if (lifecycle === 'pregame') { lifecycle = 'active'; emitState(); }
      return buf.step(n);
    },
  });
  proto.on('utt', u => { tt = compactUtt(u); uttResolve(); });
  proto.on('connect', () => uttResolve());        // an engine that skips utt must not hang seat() forever
  proto.on('gameover', w => {
    lifecycle = 'ended';
    buf.end('ended');
    if (!doneEmitted) {
      doneEmitted = true;
      em.emit('done', { outcome: w < 0 ? { draw: true } : { won: w === seat }, duration: ((native?.cycle ?? 0) * cycleMs) / 60000, why: 'gameover' });
    }
    em.emit('event', { cls: 'info', key: 'gameover', native: { kind: 'over' }, t: clock.now() });
    emitState();
  });
  proto.on('close', () => { buf.end('ended'); if (!doneEmitted) em.emit('close', new Error('engine closed')); });
  proto.on('engine-exit', code => log('java exited', code));

  return {
    meta: Object.freeze({ ...meta, ...(opts.orderCap ? { orderCap: Number(opts.orderCap) } : {}) }),
    tool, decode, proto, buffer: buf,
    on: (ev, fn) => em.on(ev, fn),
    async connect() { const p = await proto.listen(); log(`listening on ${p}`); proto.spawnEngine(); },
    // The java run is the game: seat resolves as soon as the engine has dialled in and sent its type table.
    async seat() {
      await uttReady;
      gameId = `${path.basename(String(map)).replace(/\.xml$/, '')}-${String(opponent).split('.').pop()}-${clock.now().toString(36)}`;
      tick = clock.setInterval(emitState, refreshMs);
      return { gameId, seat };
    },
    async start() {},   // the java run started the game
    async leave() { if (tick !== null) clock.clearInterval(tick); buf.end('ended'); proto.close(); },
    async concede() {
      lifecycle = 'ended';
      if (!doneEmitted) { doneEmitted = true; em.emit('done', { outcome: { won: false }, duration: ((native?.cycle ?? 0) * cycleMs) / 60000, why: 'concede' }); }
    },
    canAct: s => s.header.lifecycle === 'active',
    deadline: () => null,
    derive,
    encode: input => encode(input, { full: !!opts.full, splitStates: !!opts.splitStates, goalState: !!opts.goalState }),   // --microrts-full true: the unbudgeted full state view (oracle v2); --microrts-split-states true: never mix states within an A cluster; --microrts-goal-state true: render the standing goal, not the mid-step engine action
    expand: (cmds, state, decidedOn) => expandCmds(cmds, state, { decidedOn }),
    validate,
    send: cmds => Promise.all(buf.push(cmds)),
  };
}

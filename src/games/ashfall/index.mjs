// Ashfall Sector adapter: wires ctl, events, coder, tool, expand and validate behind the core contract.
import { EventEmitter } from 'node:events';
import { connect } from './ctl.mjs';
import { makeAuth } from './auth.mjs';
import { CLASSES, COOLDOWN_MS, toTrigger, derive } from './events.mjs';
import { encode } from './coder.mjs';
import { tool } from './tool.mjs';

// Step 2 variant: the same schema without `note` (~14 output tokens a call in game 21). Built here so tool.mjs stays a literal.
const { note: _n, ...propsNoNote } = tool.properties;
export const toolNoNote = Object.freeze({ ...tool, properties: propsNoNote, required: tool.required.filter(k => k !== 'note') });
import { expand as expandCmds, sig, STICKY } from './expand.mjs';
import { validate } from './validate.mjs';
import { ABBR_TEXT } from './abbr.mjs';

import fs from 'node:fs';
// Estimate divisor: chars per token, calibrated by test/games/ashfall/calibration.test.mjs (countTokens over the fixtures).
export const divisor = (() => { try { return JSON.parse(fs.readFileSync(new URL('./calibration.json', import.meta.url), 'utf8')).divisor || 3.5; } catch { return 3.5; } })();
export const meta = Object.freeze({
  name: 'ashfall', classes: CLASSES, cooldownMs: COOLDOWN_MS, orderCap: 15, actionMode: 'batch', toolName: 'orders',
  toolDescription: `Issue this turn's orders as a batch (act:false with empty cmds when nothing is worth doing). ${ABBR_TEXT}`, refreshMs: 500,
});

export function toHeader(s, gameId, seat) {
  const lifecycle = s.gameOver ? 'ended' : s.started ? 'active' : 'pregame';
  const phaseNative = s.gameOver ? 'over' : s.started ? 'running' : s.queued ? 'queued' : 'notStarted';
  return { lifecycle, phaseNative, clocks: { game: s.time }, gameId, seat };
}

export function createAdapter(env, opts = {}) {
  const clock = opts.clock;
  if (!clock) throw new Error('ashfall adapter needs opts.clock');
  const log = opts.log || (() => {});
  const host = opts.host || env.ASHFALL_HUB || env.ASHFALL_HOST || 'play.ashfallsector.com';
  const key = opts.key ?? (opts.open ? null : env.ASHFALL_KEY || null);
  const auth = makeAuth({ key, name: opts.name || 'quickdraw' });
  const ctl = connect({ host, auth, clock, log, WS: opts.WS });   // WS: test seam for an offline fake socket
  const em = new EventEmitter();
  let gameId = null, team = null, seat = null, doneEmitted = false, why = null;
  const recent = [];   // last 2 decisions' sticky cmd signatures

  ctl.on('state', (s, t) => {
    for (const ev of ctl.takeEvents()) {
      if (ev.kind === 'gameover') why = ev.why;
      em.emit('event', { ...toTrigger(ev, team), t: ev.t0 ?? t });
    }
    if (s.gameOver && !doneEmitted) { doneEmitted = true; em.emit('done', { outcome: { won: s.winner === team }, duration: s.time / 60, why: why || 'gameover' }); }   // before the ended state: the core must see the outcome first (game 12 recorded {} )
    em.emit('state', { header: toHeader(s, gameId, seat), native: s, t });
  });
  ctl.on('disconnect', () => em.emit('disconnect'));
  ctl.on('reconnect', () => em.emit('reconnect'));
  ctl.on('close', e => em.emit('close', e));

  return {
    meta: opts.orderCap ? Object.freeze({ ...meta, orderCap: Number(opts.orderCap) }) : meta,   // --ashfall-order-cap N
    tool: opts.noNote ? toolNoNote : tool,   // --ashfall-no-note true
    ctl,
    on: (ev, fn) => em.on(ev, fn),
    async connect() { await ctl.connect(); },
    async seat(o = {}) {
      const list = await ctl.games();
      if (list.ok && auth.player) {
        const me = ctl.hello?.player?.name;
        for (const g of list.result?.games || list.result || []) {
          if (g.status === 'over' || String(g.id) === String(o.game)) continue;
          const mySeat = (g.seats || []).findIndex(x => x && me && x.player === me);
          if (mySeat < 0) continue;
          if (g.status === 'waiting') { await ctl.join({ game: g.id, team: mySeat }); await ctl.leave(); log(`left unstarted seat in game ${g.id}`); }
          else if (o.concedeStale) { await ctl.join({ game: g.id, team: mySeat }); await ctl.concede(); await ctl.leave(); log(`conceded stale game ${g.id}`); }
          else log(`warning: unfinished seat in game ${g.id} (pass --ashfall-concede-stale to concede it)`);
        }
      }
      const r = o.game ? await ctl.join({ game: Number(o.game), team: o.team ?? 0 }) : await ctl.create({ size: o.size ?? 200, opponent: o.opponent ?? 'scripted', team: o.team ?? 0, name: o.gameName });
      if (!r.ok) throw new Error(`seat failed: ${r.error}`);
      gameId = String(r.result.game.id); team = r.result.team; seat = `team${team}`;
      return { gameId, seat };
    },
    async start() { const r = await ctl.start(); if (!r.ok) log('start:', r.error); },
    async leave() { try { if (ctl.connected) await ctl.leave(); } finally { ctl.close(); } },
    async concede() { const r = await ctl.concede(); if (!r.ok) log('concede:', r.error); },
    canAct: s => s.header.lifecycle === 'active',
    deadline: () => null,
    derive,
    encode: input => encode(input, { foldFields: !!opts.foldFields, fullBuildings: !!opts.fullBuildings, fieldsOnDemand: !!opts.fieldsOnDemand, keepAnchor: !!opts.keepAnchor, keepRemembered: !!opts.keepRemembered, compactBuildings: !!opts.compactBuildings }),
    expand: (cmds, state, decidedOn) => expandCmds(cmds, state, { recent: new Set(recent.flat()), decidedOn }),
    validate,
    async send(cmds) {
      const settled = await Promise.allSettled(cmds.map(c => { const { cmd, ...args } = c; return ctl.cmd(cmd, args); }));   // per cmd: a dropped socket mid-batch must not unsay the ones the hub ran
      const results = settled.map(s => (s.status === 'fulfilled' ? s.value : { ok: false, error: `transport: ${s.reason?.message || s.reason}` }));
      recent.push(cmds.filter((c, i) => results[i].ok && STICKY.has(c.cmd)).map(sig));
      while (recent.length > 2) recent.shift();
      return results.map(r => (r.ok ? { ok: true, result: typeof r.result === 'string' ? r.result : undefined } : { ok: false, error: r.error }));
    },
  };
}

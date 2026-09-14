// Client-side sugar → wire cmds: train count fan-out, id coercion, repeat suppression. Every trim is a dropped.
import { QUEUE_MAX, SELECTORS } from './rules.mjs';
import { UNIT } from './abbr.mjs';
import { dist } from '../../lib/cluster.mjs';

const own = (table, k) => (typeof k === 'string' && Object.hasOwn(table, k) ? table[k] : undefined);   // never the prototype: cmd:"constructor" is a model string
export const coerceId = v => {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') { const m = /^(?:n|[a-z]{2})?#?(\d+)$/i.exec(v.trim()); if (m) return Number(m[1]); }   // `n#12`, `ba#12`, `#12`, `12`; never a field label (`f5`)
  return null;
};
const UNIT_FIELDS = { move: 'units', attack: 'units', stop: 'units', disband: 'units', gather: 'units', repair: 'units', build: 'workers' };
const HARVESTER_CMDS = new Set(['build', 'gather', 'repair']);   // `idle` here means idle harvesters, not the server's idle combat units
const ID_FIELDS = { attack: ['target'], repair: ['target'], gather: ['ore'], train: ['building'], research: ['building'], cancel: ['building'], rally: ['building'] };
export const CMDS = new Set([...Object.keys(UNIT_FIELDS), ...Object.keys(ID_FIELDS)]);
export const STICKY = new Set(['build', 'research', 'cancel', 'rally']);   // repeating these across decisions duplicates the effect
export const sig = c => JSON.stringify(Object.fromEntries(Object.keys(c).sort().map(k => [k, c[k]])));   // top-level key order only; nested args keep their values
const CODE = Object.fromEntries(Object.entries(UNIT).map(([k, v]) => [v, k]));
const CLUSTER = /^([a-z]{2}) x\d+@(-?\d+),(-?\d+)/;   // an army/enemy cluster label pasted from the packet
// A cluster label selects the units of that type within r of the point, the way a box-select would. Labels are pasted from the
// packet, so they resolve against the state that packet was encoded from (decidedOn) first: units move ~7 a second, and by the
// time the order lands the cluster is elsewhere (60 of 60 label drops in games 15-20 resolved on the packet's state).
export function clusterIds(label, state, r = 8) {
  const m = CLUSTER.exec(label.trim()); if (!m) return null;
  const type = own(CODE, m[1]); if (!type) return null;
  const x = Number(m[2]), z = Number(m[3]);
  return (state?.native?.mine || []).filter(e => e.type === type && dist(e, { x, z }) <= r).map(e => e.id);
}

// expand(cmds, state, {recent, decidedOn}) → {cmds, dropped}; recent = signatures of sticky cmds sent in the last 2 decisions.
export function expand(cmds, state, { recent = new Set(), decidedOn = null, prior = [] } = {}) {   // prior: cmds already sent by this decision (--stream), for the repeat check
  const idleWorkers = () => (state?.native?.mine || []).filter(e => e.type === 'worker' && e.state === 'idle').map(e => e.id);
  // "a harvester" when none is idle: the one nearest the job (repair target, or the field that holds the gather node)
  const nearestWorker = c => {
    const s = state?.native; if (!s) return null;
    const at = c.cmd === 'repair' ? (s.mine || []).find(e => e.id === coerceId(c.target)) : c.cmd === 'gather' ? (s.fields || []).find(f => (f.nodes || []).some(n => n.id === coerceId(c.ore))) : null;
    const ws = (s.mine || []).filter(e => e.type === 'worker');
    if (!ws.length) return null;
    if (!at) return ws[0].id;
    return ws.reduce((a, b) => (dist(b, at) < dist(a, at) ? b : a)).id;
  };
  const out = [], dropped = [], seen = new Set(prior.map(sig));
  const queued = new Map();   // provisional queue length per building this decision
  for (const c of prior) if (c?.cmd === 'train') queued.set(c.building, (queued.get(c.building) || 0) + 1);   // --stream: earlier chunks of this decision already took queue room
  const byId = new Map((state?.native?.mine || []).map(e => [e.id, e]));
  for (const raw of cmds || []) {
    if (!raw || typeof raw !== 'object' || !CMDS.has(raw.cmd)) { dropped.push({ cmd: raw, reason: 'bad-cmd' }); continue; }
    const c = { ...raw };
    let bad = false;
    const uf = own(UNIT_FIELDS, c.cmd);
    if (uf) {
      const list = Array.isArray(c[uf]) ? c[uf] : [c[uf]];
      const ids = [];
      const flat = list.flatMap(v => (typeof v === 'string' && /\s/.test(v.trim()) && v.trim().split(/\s+/).every(t => SELECTORS.has(t)) ? v.trim().split(/\s+/) : [v]));   // "all army" → two selectors
      for (const v of flat) {
        if (typeof v === 'string' && SELECTORS.has(v)) {
          if (v === 'idle' && HARVESTER_CMDS.has(c.cmd)) { const idle = idleWorkers(); if (idle.length) ids.push(...idle); else if (c.cmd === 'build') ids.push('workers'); else { const w = nearestWorker(c); if (w != null) ids.push(w); } }
          else ids.push(v);
          continue;
        }
        const cl = typeof v === 'string' ? (decidedOn && clusterIds(v, decidedOn)) || clusterIds(v, state) : null;
        if (cl) { ids.push(...cl); continue; }
        const id = coerceId(v); if (id === null) bad = true; else ids.push(id);
      }
      c[uf] = ids;
      if (!ids.length) bad = true;
    }
    for (const f of own(ID_FIELDS, c.cmd) || []) { if (c[f] === null || c[f] === undefined) { if (f === 'ore') continue; bad = true; break; } const id = coerceId(c[f]); if (id === null) bad = true; else c[f] = id; }
    if (bad) { dropped.push({ cmd: raw, reason: 'bad-id' }); continue; }
    if (c.cmd === 'attack') {   // the prompt: a remembered building is attack-moved at, not attacked; the model writes `attack` anyway
      const s = state?.native, mem = (s?.enemyBuildingsRemembered || []).find(e => e.id === c.target);
      if (mem && !(s?.enemyVisible || []).some(e => e.id === c.target)) { out.push({ cmd: 'move', units: c.units, x: Math.round(mem.x), z: Math.round(mem.z), attackMove: true }); continue; }
    }
    if (c.cmd === 'train') {
      const count = Math.max(1, Math.min(5, Number(c.count) || 1));
      delete c.count;
      const b = byId.get(c.building);
      const cap = b ? (QUEUE_MAX[b.type] ?? 5) : 5;
      const have = (b?.queue?.length || 0) + (queued.get(c.building) || 0);
      const room = Math.max(0, cap - have);
      for (let i = 0; i < count; i++) {
        if (i >= room) { dropped.push({ cmd: c, reason: 'queue-full' }); continue; }
        out.push({ ...c }); queued.set(c.building, (queued.get(c.building) || 0) + 1);
      }
      continue;
    }
    const s = sig(c);
    if (seen.has(s) || (STICKY.has(c.cmd) && recent.has(s))) { dropped.push({ cmd: c, reason: 'repeat' }); continue; }
    seen.add(s);
    out.push(c);
  }
  return { cmds: out, dropped };
}

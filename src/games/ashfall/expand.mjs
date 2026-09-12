// Client-side sugar → wire cmds: train count fan-out, id coercion, repeat suppression. Every trim is a dropped.
import { QUEUE_MAX, SELECTORS } from './rules.mjs';
import { UNIT } from './abbr.mjs';
import { dist } from '../../lib/cluster.mjs';

const own = (table, k) => (typeof k === 'string' && Object.hasOwn(table, k) ? table[k] : undefined);   // never the prototype: cmd:"constructor" is a model string
export const coerceId = v => {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') { const m = /^(?:[a-z]+)?#?(\d+)$/i.exec(v.trim()); if (m) return Number(m[1]); }
  return null;
};
const UNIT_FIELDS = { move: 'units', attack: 'units', stop: 'units', disband: 'units', gather: 'units', repair: 'units', build: 'workers' };
const ID_FIELDS = { attack: ['target'], repair: ['target'], gather: ['ore'], train: ['building'], research: ['building'], cancel: ['building'], rally: ['building'] };
export const CMDS = new Set([...Object.keys(UNIT_FIELDS), ...Object.keys(ID_FIELDS)]);
export const STICKY = new Set(['build', 'research', 'cancel', 'rally']);   // repeating these across decisions duplicates the effect
export const sig = c => JSON.stringify(Object.fromEntries(Object.keys(c).sort().map(k => [k, c[k]])));   // top-level key order only; nested args keep their values
const CODE = Object.fromEntries(Object.entries(UNIT).map(([k, v]) => [v, k]));
const CLUSTER = /^([a-z]{2}) x\d+@(-?\d+),(-?\d+)/;   // an army/enemy cluster label pasted from the packet
// A cluster label selects the units of that type within r of the point, the way a box-select would.
export function clusterIds(label, state, r = 8) {
  const m = CLUSTER.exec(label.trim()); if (!m) return null;
  const type = own(CODE, m[1]); if (!type) return null;
  const x = Number(m[2]), z = Number(m[3]);
  return (state?.native?.mine || []).filter(e => e.type === type && dist(e, { x, z }) <= r).map(e => e.id);
}

// expand(cmds, state, {recent}) → {cmds, dropped}; recent = signatures of sticky cmds sent in the last 2 decisions.
export function expand(cmds, state, { recent = new Set() } = {}) {
  const out = [], dropped = [], seen = new Set();
  const queued = new Map();   // provisional queue length per building this decision
  const byId = new Map((state?.native?.mine || []).map(e => [e.id, e]));
  for (const raw of cmds || []) {
    if (!raw || typeof raw !== 'object' || !CMDS.has(raw.cmd)) { dropped.push({ cmd: raw, reason: 'bad-cmd' }); continue; }
    const c = { ...raw };
    let bad = false;
    const uf = own(UNIT_FIELDS, c.cmd);
    if (uf) {
      const list = Array.isArray(c[uf]) ? c[uf] : [c[uf]];
      const ids = [];
      for (const v of list) {
        if (typeof v === 'string' && SELECTORS.has(v)) {
          if (v === 'idle' && uf === 'workers') { const idle = (state?.native?.mine || []).filter(e => e.type === 'worker' && e.state === 'idle').map(e => e.id); ids.push(...(idle.length ? idle : ['workers'])); }
          else ids.push(v);
          continue;
        }
        const cl = typeof v === 'string' ? clusterIds(v, state) : null;
        if (cl) { ids.push(...cl); continue; }
        const id = coerceId(v); if (id === null) bad = true; else ids.push(id);
      }
      c[uf] = ids;
      if (!ids.length) bad = true;
    }
    for (const f of own(ID_FIELDS, c.cmd) || []) { if (c[f] === null || c[f] === undefined) { if (f === 'ore') continue; bad = true; break; } const id = coerceId(c[f]); if (id === null) bad = true; else c[f] = id; }
    if (bad) { dropped.push({ cmd: raw, reason: 'bad-id' }); continue; }
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

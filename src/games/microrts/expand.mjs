// Client-side sugar → goal cmds: selectors and pasted cluster labels become unit ids, ids are coerced. Every trim
// is a `dropped` with a reason so it reaches lastOrders.
// `train count` does NOT fan out: MicroRTS has no build queue, so the count stays on the goal and the buffer
// produces one unit at a time until it is spent (orders.mjs).
import { coerceId, SELECTORS } from './lang.mjs';
import { NAME } from './abbr.mjs';
import { manhattan } from './rules.mjs';

const CLUSTER = /^([a-z]{2}) x\d+@(-?\d+),(-?\d+)/;
export const CMDS = new Set(['train', 'harvest', 'move', 'attack']);
export const sig = c => JSON.stringify(Object.fromEntries(Object.keys(c).sort().map(k => [k, c[k]])));
const mobile = n => n.units.filter(u => u.player === n.me && n.tt[u.type]?.move);

// A cluster label selects the units of that type within r of the point, the way a box-select would. Labels are
// pasted from the packet, so they resolve against the state that packet was encoded from (decidedOn) first.
export function clusterIds(label, state, r = 2) {
  const m = CLUSTER.exec(String(label).trim()); if (!m) return null;
  const type = NAME[m[1]]; if (!type) return null;
  const at = { x: Number(m[2]), y: Number(m[3]) };
  const n = state?.native; if (!n) return null;
  return n.units.filter(u => u.player === n.me && u.type === type && manhattan(u, at) <= r).map(u => u.id);
}

export function expand(cmds, state, { decidedOn = null } = {}) {
  const n = state?.native;
  const out = [], dropped = [], seen = new Set();
  const select = v => {
    if (v === 'all') return mobile(n).map(u => u.id);
    if (v === 'idle') return mobile(n).filter(u => !u.busy).map(u => u.id);
    const type = NAME[v];
    return type ? mobile(n).filter(u => u.type === type).map(u => u.id) : [];
  };
  for (const raw of cmds || []) {
    if (!raw || typeof raw !== 'object' || !CMDS.has(raw.cmd)) { dropped.push({ cmd: raw, reason: 'bad-cmd' }); continue; }
    const c = { ...raw };
    let bad = false;
    if (c.units) {
      const ids = [];
      for (const v of Array.isArray(c.units) ? c.units : [c.units]) {
        if (typeof v === 'string' && SELECTORS.has(v)) { ids.push(...(n ? select(v) : [])); continue; }
        const cl = typeof v === 'string' ? (decidedOn && clusterIds(v, decidedOn)) || clusterIds(v, state) : null;
        if (cl) { ids.push(...cl); continue; }
        const id = coerceId(v); if (id === null) bad = true; else ids.push(id);
      }
      c.units = [...new Set(ids)];
      if (!c.units.length) bad = true;
    }
    for (const f of ['building', 'target', 'node']) {
      if (!(f in c) || c[f] === null || c[f] === undefined) continue;
      const id = coerceId(c[f]); if (id === null) bad = true; else c[f] = id;
    }
    if (bad) { dropped.push({ cmd: raw, reason: 'bad-id' }); continue; }
    if (c.cmd === 'train') c.count = Math.max(1, Math.min(5, Number(c.count) || 1));
    const s = sig(c);
    if (seen.has(s)) { dropped.push({ cmd: c, reason: 'repeat' }); continue; }
    seen.add(s);
    out.push(c);
  }
  return { cmds: out, dropped };
}

// Cycle-to-cycle diffs → core triggers, and the pure derive() predicates. No memory here; the core edge-detects.
import { diffById } from '../../core/digest.mjs';
import { manhattan } from './rules.mjs';
import { MOBILE } from './abbr.mjs';

export const CLASSES = ['danger', 'contact', 'loss', 'idle', 'done', 'economy', 'info'];
export const COOLDOWN_MS = { danger: 2000, contact: 1000, idle: 1000 };
export const CONTACT_R = 6;      // enemy this close to anything of mine is contact
export const IDLE_CYCLES = 10;   // a mobile unit with nothing to do for this long is idle
const CELL = 4;                  // contact keys collapse on a 4x4 grid

const mine = n => n.units.filter(u => u.player === n.me);
const theirs = n => n.units.filter(u => u.player >= 0 && u.player !== n.me);
const isBuilding = (n, u) => !(n.tt[u.type]?.move);
export const isNode = (n, u) => !!n.tt[u.type]?.res;

// detect(prev, next) → [{cls, key, native, gt}] for one engine cycle. Buildings rank above units via urgency.
export function detect(prev, next) {
  if (!prev) return [{ cls: 'info', key: 'started', native: { kind: 'started' }, gt: next.cycle }];
  const d = diffById(prev, next, { lists: [{ name: 'u', path: 'units', fields: ['hp'] }] }).u;
  const out = [], gt = next.cycle;
  for (const u of d.removed) {
    if (isNode(prev, u)) continue;
    if (u.player === next.me) out.push({ cls: 'loss', key: String(u.id), native: { kind: 'lost', id: u.id, type: u.type }, gt });
    else if (u.player >= 0) out.push({ cls: 'info', key: String(u.id), native: { kind: 'kill', id: u.id, type: u.type }, gt });
  }
  for (const u of d.added) if (u.player === next.me) out.push({ cls: 'done', key: String(u.id), native: { kind: 'done', id: u.id, type: u.type }, gt });
  for (const c of d.changed) {
    const u = c.next;
    if (u.player !== next.me || u.hp >= c.prev.hp) continue;
    out.push({ cls: 'danger', key: String(u.id), urgency: isBuilding(next, u) ? 0 : 0.5, native: { kind: 'dmg', id: u.id, type: u.type, hp: u.hp }, gt });
  }
  return out;
}

// toTrigger(ev) → the trigger an adapter emitted, as a recorded fixture or run line carries it. detect() already builds
// triggers, so this is the identity on the fields the core keeps; it exists because bin/bench.mjs asks every game's
// events.mjs for it.
export const toTrigger = ev => ({ cls: ev.cls, key: ev.key, urgency: ev.urgency, native: ev.native, gt: ev.gt });

// derive(state) → state predicates; the core fires each (cls,key) once and re-arms when it stops being reported.
export function derive(state) {
  const n = state.native, out = [], my = mine(n), them = theirs(n);
  const anchors = my.filter(u => !isNode(n, u));
  for (const e of them) {
    if (anchors.some(a => manhattan(a, e) <= CONTACT_R)) out.push({ cls: 'contact', key: `${Math.floor(e.x / CELL)},${Math.floor(e.y / CELL)}` });
  }
  for (const u of my) {
    const t = n.tt[u.type];
    if (!t) continue;
    if (t.move) { if (MOBILE.includes(u.type) && u.idleFor >= IDLE_CYCLES) out.push({ cls: 'idle', key: `u${u.id}` }); continue; }
    if (!u.busy && (t.makes || []).length) out.push({ cls: 'economy', key: `b${u.id}` });
    if (t.hp && u.hp / t.hp < 0.6) out.push({ cls: 'danger', key: `hp${u.id}`, urgency: 0 });
  }
  for (const what of purchases(n)) if (n.res[n.me] >= (n.tt[what]?.cost ?? Infinity)) out.push({ cls: 'economy', key: `r${what}` });
  return out;
}

// purchases(native): every type my finished buildings can make, cheapest first — the lines the economy trigger watches.
export function purchases(n) {
  const set = new Set();
  for (const u of mine(n)) if (!n.tt[u.type]?.move) for (const w of n.tt[u.type]?.makes || []) set.add(w);
  return [...set].sort((a, b) => (n.tt[a]?.cost ?? 0) - (n.tt[b]?.cost ?? 0) || a.localeCompare(b));
}

// Native state → the same facts a packet reader returns, with no text round trip: the state side of the fidelity oracle
// (bin/oracle.mjs). Same shape as read.mjs's read(), and the same derived quantities as coder.mjs — post/yard, the `out`
// test, `(2nd ba)`, the search waypoint, the clusters, dB/dA are imported from coder, never restated, so the two sides
// cannot drift.
// Oracle v2: this is the FULL state view, not the encoder's shaping. Every unit is its own A entry with its own state
// (r: -1 never merges), every building carries its position, F is unfolded — so the packet's shaping (compact B, folded F,
// one dominant state per cluster) shows up as compression loss, and its budget and cadence as budget loss. The guide and
// planMarks marks stay, gated by the same gameOpts: they are state-derived facts, not budget.
// Oracle v3: X unfolds the same way — one line per enemy entity, its own cell and its own dB/dA, never merged.
// D, T and L are classifications of their own rendered text (l.raw *is* that text), so they go through coder's renderer
// and read's classifier — one source each, and still no encode/assemble round trip.
import { UPGRADE, STATE, FIELD_KIND, TAG } from './abbr.mjs';
import { cluster, nearest, dist } from '../../lib/cluster.mjs';
import { delta as renderDelta, renderTrigger, lastOrders as renderLast, post, yard, secondBarracksDue, searchField, searching,
  ty, pct, unitsOf, bldsOf, isDone, isOut, troopers, FULL_R } from './coder.mjs';
import { delta as readDelta, triggers as readTriggers, last as readLast } from './read.mjs';

const R = n => { const v = Math.round(n); return Object.is(v, -0) ? 0 : v; };   // the packet prints -0 as `0`; so does this
const P = p => ({ x: R(p.x), z: R(p.z) });
const ALL = Object.values(TAG);

function header(s, guide) {
  const up = {};
  for (const [k, v] of Object.entries(s.upgrades || {})) if (v > 0) up[UPGRADE[k] || k] = v;
  return {
    t: Math.max(0, R(s.time)), o: R(s.ore), c: R(s.crystal),
    sUsed: s.supply?.used ?? 0, sCap: s.supply?.cap ?? 0, capped: !!(s.supply && s.supply.used >= s.supply.cap),
    wk: guide ? unitsOf(s).filter(u => u.type === 'worker').length : null, tr: guide ? troopers(s) : null,
    up, elimMe: s.eliminationIn != null ? R(s.eliminationIn) : null, elimThem: s.enemyEliminationIn != null ? R(s.enemyEliminationIn) : null,
  };
}

function production(s, guide, planMarks) {
  const failed = planMarks && troopers(s) < 5;
  const out = [];
  for (const b of bldsOf(s)) {
    if (!isDone(b)) { out.push({ type: ty(b.type), id: b.id, bld: pct(b.progress, 1), q: null, head: null, prog: null, rally: null, out: false, failed: false, done: false, idle: false }); continue; }
    if (b.type !== 'core' && b.type !== 'barracks' && b.type !== 'armory') continue;
    const q = (b.queue || []).length, o = !!(guide && b.rally && isOut(s, b.rally));
    out.push({ type: ty(b.type), id: b.id, bld: null, q, head: q ? ty(b.queue[0]) : null, prog: q > 0 && b.prog != null ? pct(b.prog, 1) : null,
      rally: b.rally ? P(b.rally) : null, out: o, failed: o && failed, done: true, idle: q === 0 });
  }
  return out;
}

function economy(s) {
  const workers = unitsOf(s).filter(u => u.type === 'worker'), fields = [];
  (s.fields || []).forEach((f, i) => {
    const n = workers.filter(w => (w.state === 'gather' || w.state === 'return') && dist(w, f) <= 14).length;
    if (n) fields.push({ i: i + 1, res: f.res === 'crystal' ? 'cry' : 'ore', wk: n, o: f.ore != null ? R(f.ore) : null });
  });
  return { fields, idleWk: workers.filter(w => w.state === 'idle').map(w => w.id) };
}

const army = (s, guide) => cluster(unitsOf(s), { r: FULL_R }).map(c => ({
  type: ty(c.type), n: c.n, x: R(c.x), z: R(c.z), state: STATE[c.state] || c.state || '?',
  ids: c.n <= 2 ? c.ids : [], out: !!(guide && c.type !== 'worker' && isOut(s, c)), label: `${ty(c.type)} x${c.n}@${R(c.x)},${R(c.z)}`,
}));

// The full view: every building with its position, in the state's own order, plus the marks the compact line carries.
function buildings(s, { guide, planMarks }) {
  const blds = bldsOf(s);
  const b = {
    list: blds.map(e => ({ type: ty(e.type), id: e.id, x: R(e.x), z: R(e.z),
      hp: isDone(e) ? pct(e.hp, e.max) : 100, bld: isDone(e) ? null : pct(e.progress, 1) })),
    post: null, yard: null,
    noTu: !!(guide && blds.length && !blds.some(e => e.type === 'turret')),
    secondBa: !!(guide && planMarks && secondBarracksDue(s)),
  };
  if (guide && s.myBase && blds.some(e => e.type === 'core')) { b.post = P(post(s)); b.yard = P(yard(s)); }
  return b;
}

// v3: X renders per enemy entity, like A — FULL_R never merges, so every enemy keeps its own cell, dug flag, id and dB/dA.
function enemy(s) {
  const blds = bldsOf(s), units = unitsOf(s).filter(u => u.type !== 'worker');
  return cluster(s.enemyVisible || [], { r: FULL_R, stateOf: e => (e.entrenched ? 'dug' : undefined) }).map(c => {
    const db = nearest(c, blds).d, da = nearest(c, units).d;
    return { type: ty(c.type), n: c.n, x: R(c.x), z: R(c.z), dB: Number.isFinite(db) ? R(db) : null, dA: Number.isFinite(da) ? R(da) : null,
      dug: c.state === 'dug', ids: c.n <= 2 ? c.ids : [], label: `${ty(c.type)} x${c.n}@${R(c.x)},${R(c.z)}` };
  });
}

function remembered(s, { searchFields, guide }) {
  const m = {
    buildings: (s.enemyBuildingsRemembered || []).map(b => ({ type: ty(b.type), id: b.id, x: R(b.x), z: R(b.z), hp: pct(b.hp, b.max), age: R(Math.max(0, s.time - (b.lastSeen ?? s.time))) })),
    search: null,
  };
  if (!m.buildings.length && searchFields && searching(s)) { const w = searchField(s, { guide }); if (w) m.search = { field: w.i, x: R(w.f.x), z: R(w.f.z) }; }
  return m;
}

// The reader keeps kind/live/nodes for an explored field only. The full view is unfolded, so the order is the state's own
// (folding only reorders the unexplored list).
function fields(s) {
  const all = (s.fields || []).map((f, i) => ({ f, i: i + 1 }));
  const un = ({ f, i }) => ({ i, crystal: f.res === 'crystal', x: R(f.x), z: R(f.z) });
  const full = ({ f, i }) => ({ i, kind: FIELD_KIND[f.kind] || f.kind, res: f.res === 'crystal' ? 'cry' : 'ore', x: R(f.x), z: R(f.z), o: R(f.ore), live: !!f.live, nodes: (f.nodes || []).map(n => n.id) });
  return { fields: all.filter(x => x.f.ore != null).map(full), unexplored: all.filter(x => x.f.ore == null).map(un) };
}

// factsOf(encode's inputs, encode's gameOpts) → read()'s shape, unbudgeted and unshaped: layers is all eleven tags.
// The shaping options (foldFields, fullBuildings, keepAnchor, compactBuildings) are deliberately ignored — this is the
// state, not a packet; only the marks' gates (guide, planMarks, searchFields) are read off the opts.
export function factsOf({ state, prevDecisionState = null, triggers = [], lastOrders: lo = [], pending = [] }, opts = {}) {
  const { searchFields = false, guide = false, planMarks = false } = opts;
  const s = state.native, prev = prevDecisionState?.native || null;
  const tText = triggers.filter(tr => !(guide && tr.cls === 'heartbeat')).slice(0, 6).map(renderTrigger).join('; ') || 'none';
  const lText = renderLast(lo) + (pending.length ? `; pending: ${pending.map(set => set.slice(0, 4).map(renderTrigger).join(', ')).join(' | ')}` : '');
  return {
    h: header(s, guide), d: readDelta(renderDelta(prev, s)), t: readTriggers(tText),
    p: production(s, guide, planMarks), e: economy(s), a: army(s, guide),
    b: buildings(s, { guide, planMarks }),
    x: enemy(s), m: remembered(s, { searchFields, guide }), f: fields(s),
    l: readLast(lText), layers: new Set(ALL),
  };
}

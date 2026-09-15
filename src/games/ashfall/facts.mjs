// Native state → the same facts a packet reader returns, with no text round trip: the state side of the fidelity oracle
// (bin/oracle.mjs). Same shape as read.mjs's read(), the same gameOpts as encode(), and the same derived quantities as
// coder.mjs — post/yard, the `out` test, `(2nd ba)`, the search waypoint, the clusters, dB/dA are imported from coder,
// never restated, so the two sides cannot drift. The one difference is the budget: every layer is here with every line,
// so what the packet dropped (a layer on the --full-every cadence, a line to --packet-max) is the gap the oracle measures.
// D, T and L are classifications of their own rendered text (l.raw *is* that text), so they go through coder's renderer
// and read's classifier — one source each, and still no encode/assemble round trip.
import { UPGRADE, STATE, FIELD_KIND, TAG } from './abbr.mjs';
import { cluster, nearest, dist } from '../../lib/cluster.mjs';
import { delta as renderDelta, renderTrigger, lastOrders as renderLast, post, yard, secondBarracksDue, searchField, searching,
  ty, pct, unitsOf, bldsOf, isDone, isOut, troopers, isAnchor } from './coder.mjs';
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

const army = (s, guide) => cluster(unitsOf(s), { r: 8 }).map(c => ({
  type: ty(c.type), n: c.n, x: R(c.x), z: R(c.z), state: STATE[c.state] || c.state || '?',
  ids: c.n <= 2 ? c.ids : [], out: !!(guide && c.type !== 'worker' && isOut(s, c)), label: `${ty(c.type)} x${c.n}@${R(c.x)},${R(c.z)}`,
}));

// compact B carries a position for the anchors only; the full layer carries every one. Both sides read the same opts.
function buildings(s, { compactB, fullBuildings, keepAnchor, guide, planMarks }) {
  const blds = bldsOf(s);
  const order = !compactB && fullBuildings && keepAnchor ? [...blds.filter(isAnchor), ...blds.filter(b => !isAnchor(b))] : blds;
  const b = {
    list: order.map(e => ({ type: ty(e.type), id: e.id, x: !compactB || isAnchor(e) ? R(e.x) : null, z: !compactB || isAnchor(e) ? R(e.z) : null,
      hp: isDone(e) ? pct(e.hp, e.max) : 100, bld: isDone(e) ? null : pct(e.progress, 1) })),
    post: null, yard: null,
    noTu: !!(compactB && guide && blds.length && !blds.some(e => e.type === 'turret')),
    secondBa: !!(compactB && guide && planMarks && secondBarracksDue(s)),
  };
  if (compactB && guide && s.myBase && blds.some(e => e.type === 'core')) { b.post = P(post(s)); b.yard = P(yard(s)); }
  return b;
}

function enemy(s) {
  const blds = bldsOf(s), units = unitsOf(s).filter(u => u.type !== 'worker');
  return cluster(s.enemyVisible || [], { r: 8, stateOf: e => (e.entrenched ? 'dug' : undefined) }).map(c => {
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

// The reader keeps kind/live/nodes for an explored field only, folded or not; folding changes the order of the rest, nothing else.
function fields(s, { fold, searchFields }) {
  const all = (s.fields || []).map((f, i) => ({ f, i: i + 1 }));
  const un = ({ f, i }) => ({ i, crystal: f.res === 'crystal', x: R(f.x), z: R(f.z) });
  const full = ({ f, i }) => ({ i, kind: FIELD_KIND[f.kind] || f.kind, res: f.res === 'crystal' ? 'cry' : 'ore', x: R(f.x), z: R(f.z), o: R(f.ore), live: !!f.live, nodes: (f.nodes || []).map(n => n.id) });
  const unexplored = all.filter(x => x.f.ore == null);
  if (!fold) return { fields: all.filter(x => x.f.ore != null).map(full), unexplored: all.filter(x => x.f.ore == null).map(un) };
  if (searchFields && s.myBase) { const m = { x: -s.myBase.x, z: -s.myBase.z }; unexplored.sort((a, b) => (a.f.res === 'crystal') - (b.f.res === 'crystal') || dist(a.f, m) - dist(b.f, m)); }
  return { fields: all.filter(x => x.f.ore != null).map(full), unexplored: unexplored.map(un) };
}

// factsOf(encode's inputs, encode's gameOpts) → read()'s shape, unbudgeted: layers is all eleven tags.
export function factsOf({ state, prevDecisionState = null, triggers = [], lastOrders: lo = [], pending = [] }, opts = {}) {
  const { foldFields = false, fullBuildings = false, keepAnchor = false, compactBuildings: compactB = false, searchFields = false, guide = false, planMarks = false } = opts;
  const s = state.native, prev = prevDecisionState?.native || null;
  const tText = triggers.filter(tr => !(guide && tr.cls === 'heartbeat')).slice(0, 6).map(renderTrigger).join('; ') || 'none';
  const lText = renderLast(lo) + (pending.length ? `; pending: ${pending.map(set => set.slice(0, 4).map(renderTrigger).join(', ')).join(' | ')}` : '');
  return {
    h: header(s, guide), d: readDelta(renderDelta(prev, s)), t: readTriggers(tText),
    p: production(s, guide, planMarks), e: economy(s), a: army(s, guide),
    b: buildings(s, { compactB, fullBuildings, keepAnchor, guide, planMarks }),
    x: enemy(s), m: remembered(s, { searchFields, guide }), f: fields(s, { fold: foldFields, searchFields }),
    l: readLast(lText), layers: new Set(ALL),
  };
}

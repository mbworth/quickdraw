export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Greedy spatial clustering by type: an entity joins the first cluster of its type whose centroid is within r.
export function cluster(ents, { r = 8, stateOf = e => e.state } = {}) {
  const out = [];
  for (const e of ents) {
    const type = e.type;
    let c = out.find(c => c.type === type && dist({ x: c.cx, z: c.cz }, e) <= r);
    if (!c) { c = { type, n: 0, sx: 0, sz: 0, cx: e.x, cz: e.z, ids: [], states: new Map(), hp: 0, max: 0 }; out.push(c); }
    c.n++; c.sx += e.x; c.sz += e.z; c.cx = c.sx / c.n; c.cz = c.sz / c.n; c.ids.push(e.id);
    c.hp += e.hp || 0; c.max += e.max || 0;
    const s = stateOf(e); if (s !== undefined) c.states.set(s, (c.states.get(s) || 0) + 1);
  }
  return out.map(c => ({ type: c.type, n: c.n, x: Math.round(c.cx), z: Math.round(c.cz), ids: c.ids, hp: c.hp, max: c.max, state: [...c.states.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] }));
}
export const nearest = (p, list) => list.reduce((best, e) => { const d = dist(p, e); return d < best.d ? { e, d } : best; }, { e: null, d: Infinity });

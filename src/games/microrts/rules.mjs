// Engine rules. Action type ints and direction offsets are protocol constants (rts/UnitAction.java,
// rts/PhysicalGameState.java); every cost, duration and range comes from the UnitTypeTable the engine
// sends on connect, so the adapter keeps no copy of the game's balance (client only).
export const ACT = { NONE: 0, MOVE: 1, HARVEST: 2, RETURN: 3, PRODUCE: 4, ATTACK: 5 };
export const DIR_NONE = -1;
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];   // UP RIGHT DOWN LEFT
export const dirOf = (from, to) => DX.findIndex((_, d) => from.x + DX[d] === to.x && from.y + DY[d] === to.y);
export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const sqDist = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const inMap = (p, w, h) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
export const wallAt = (n, x, y) => n.terrain[x + y * n.width] !== '0';

// compactUtt(utt) → the slice of the type table the packet and the rules read, small enough to ride on every
// recorded state (replay must rebuild encode from the run file alone, with no engine to ask).
export function compactUtt(utt) {
  const tt = {};
  for (const t of utt.unitTypes || []) tt[t.name] = {
    cost: t.cost, hp: t.hp, pt: t.produceTime, mv: t.moveTime, rng: t.attackRange, dmg: t.maxDamage,
    ht: t.harvestTime, rt: t.returnTime, at: t.attackTime, res: !!t.isResource, pile: !!t.isStockpile,
    harv: !!t.canHarvest, move: !!t.canMove, atk: !!t.canAttack, makes: t.produces || [],
  };
  return tt;
}
// ETA of an in-flight action, from the acting unit's own durations (UnitAction.ETA).
export function etaOf(tt, type, a) {
  const t = tt[type] || {};
  switch (a?.type) {
    case ACT.MOVE: return t.mv ?? 10;
    case ACT.HARVEST: return t.ht ?? 10;
    case ACT.RETURN: return t.mv ?? 10;   // UnitAction.ETA returns moveTime for RETURN, not returnTime
    case ACT.ATTACK: return t.at ?? 10;
    case ACT.PRODUCE: return tt[a.unitType]?.pt ?? 10;
    default: return a?.parameter ?? 10;   // TYPE_NONE carries its duration in parameter
  }
}
export const stateOf = a => (a == null ? 'idle' : ['idle', 'move', 'harvest', 'return', 'produce', 'attack'][a.type] ?? 'idle');

// bfsStep(native, unit, goal, {adjacent}) → the direction of the first step of a shortest path, or -1.
// Walls and every other unit block; `adjacent` stops one cell short (harvest, return, build-adjacent).
export function bfsStep(n, u, goal, { adjacent = false, reserved = null } = {}) {
  const { width: w, height: h } = n;
  const blocked = new Set(reserved || []);   // cells another of my units is stepping into this cycle: the engine cancels both movers
  for (const o of n.units) if (o.id !== u.id) blocked.add(o.x + o.y * w);
  const want = new Set();
  if (adjacent) { for (let d = 0; d < 4; d++) { const x = goal.x + DX[d], y = goal.y + DY[d]; if (x >= 0 && y >= 0 && x < w && y < h) want.add(x + y * w); } }
  else want.add(goal.x + goal.y * w);
  if (want.has(u.x + u.y * w)) return DIR_NONE;   // already there
  const from = new Int32Array(w * h).fill(-1), start = u.x + u.y * w;
  from[start] = start;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const c = q[i], cx = c % w, cy = (c / w) | 0;
    for (let d = 0; d < 4; d++) {
      const x = cx + DX[d], y = cy + DY[d];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = x + y * w;
      if (from[k] >= 0 || wallAt(n, x, y) || blocked.has(k)) continue;
      from[k] = c;
      if (want.has(k)) { let cur = k; while (from[cur] !== start) cur = from[cur]; return dirOf(u, { x: cur % w, y: (cur / w) | 0 }); }
      q.push(k);
    }
  }
  return DIR_NONE;
}
// freeDir(native, bld, toward) → a direction with an empty, walkable neighbour, nearest `toward` first; -1 when boxed in.
export function freeDir(n, b, toward = null, reserved = null) {
  const taken = new Set([...(reserved || []), ...n.units.map(o => o.x + o.y * n.width)]);
  const cand = [];
  for (let d = 0; d < 4; d++) {
    const x = b.x + DX[d], y = b.y + DY[d];
    if (x < 0 || y < 0 || x >= n.width || y >= n.height || wallAt(n, x, y) || taken.has(x + y * n.width)) continue;
    cand.push({ d, k: toward ? manhattan({ x, y }, toward) : d });
  }
  cand.sort((a, b2) => a.k - b2.k || a.d - b2.d);
  return cand.length ? cand[0].d : DIR_NONE;
}

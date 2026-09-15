// The standing-order buffer: the whole answer to MicroRTS lockstep.
//
// The engine takes one PlayerAction per cycle and every action is a single step — one cell of movement, one
// adjacent harvest, one adjacent attack. A model deciding every 500 ms (5 cycles) cannot micro that. So an order
// is not a wire message: it is a GOAL parked in this buffer, keyed by its subject (unit id, or building id for
// production). Every cycle, step() walks the goals, skips units the engine shows as busy, and issues the next
// single step toward each goal. A new order for the same subject REPLACES its goal, so re-issuing a standing
// order is idempotent and the model may repeat itself freely.
//
// A goal leaves the buffer when it completes (arrived, target dead, count spent), when its unit dies, or when it
// could not be stepped for `dropAfter` consecutive cycles (boxed in, unaffordable, node gone) — that last one is
// the `stuck` rejection.
//
// send() resolves on the FIRST step() after the order is pushed: {ok:true} if a step went out or the subject is
// merely busy (the goal stands), {ok:false, error} if it was impossible right then. That bounds send() at one
// cycle (~cycleMs) instead of the whole life of the goal, which can be minutes.
import { ACT, DX, DY, dirOf, sqDist, manhattan, bfsStep, freeDir } from './rules.mjs';

// One goal per unit, whatever the verb: a Worker can be both a producer and a fighter, and two goals on one unit would
// put two actions for the same id in a PlayerAction, which fails the engine's integrity check.
const keyOf = id => `u${id}`;

export function createBuffer({ dropAfter = 20 } = {}) {
  const goals = new Map();   // subject key → goal
  const orders = [];         // unsettled orders awaiting their first step
  let ended = null;

  function push(cmds) {
    if (ended) return cmds.map(() => ({ ok: false, error: ended }));
    return cmds.map(c => {
      const o = { cmd: c, subjects: [], resolve: null, reason: null };
      const p = new Promise(r => { o.resolve = r; });
      if (c.cmd === 'train') { const k = keyOf(c.building); goals.set(k, { k, kind: 'train', building: c.building, type: c.type, count: c.count ?? 1, misses: 0, o }); o.subjects.push(k); }
      else for (const id of c.units) { const k = keyOf(id); goals.set(k, { k, kind: c.cmd, unit: id, x: c.x, y: c.y, target: c.target, node: c.node, misses: 0, o }); o.subjects.push(k); }
      orders.push(o);
      return p;
    });
  }

  // step(native) → the PlayerAction entries for this cycle.
  function step(n) {
    const byId = new Map(n.units.map(u => [u.id, u]));
    const out = [], progress = new Set();
    // Cells already spoken for: every in-flight move or produce on the board, plus what this cycle's own steps take.
    const reserved = new Set(n.units.filter(u => u.dest).map(u => u.dest.x + u.dest.y * n.width));
    // Money already committed: the engine charges a produce when it finishes, but counts it against the bank from the
    // cycle it is issued, so a second produce over the same coins is an "inconsistent action" and one of them is cancelled.
    let res = (n.res[n.me] ?? 0) - n.units.reduce((c, u) => c + (u.player === n.me && u.make ? n.tt[u.make]?.cost ?? 0 : 0), 0);
    for (const [k, g] of [...goals]) {
      const subj = byId.get(g.kind === 'train' ? g.building : g.unit);
      if (!subj || subj.player !== n.me) { goals.delete(k); fail(g, 'dead'); continue; }
      if (subj.busy) { progress.add(g.o); continue; }               // the goal stands; nothing to issue this cycle
      const r = nextStep(n, byId, subj, g, res, reserved);
      if (r === null) {
        if (++g.misses >= dropAfter) { goals.delete(k); fail(g, 'stuck'); } else fail(g, 'wait');   // `wait`: the goal stands, it just could not be stepped this cycle
        continue;
      }
      g.misses = 0;
      if (r.action) { out.push({ unitID: subj.id, unitAction: r.action }); progress.add(g.o); res -= r.spend || 0; if (r.cell != null) reserved.add(r.cell); }
      else progress.add(g.o);
      if (r.done) goals.delete(k);
    }
    settle(progress);
    return out;
  }

  const fail = (g, reason) => { if (!g.o.reason) g.o.reason = reason; };
  function settle(progress) {
    for (const o of orders.splice(0)) o.resolve(progress.has(o) ? { ok: true } : { ok: false, error: o.reason || 'stuck' });
  }
  return {
    push, step,
    get size() { return goals.size; },
    goals: () => [...goals.values()],
    end(why) { ended = why; goals.clear(); settle(new Set()); },
  };
}

// nextStep → {action?, done?, spend?} for this cycle, or null when the goal cannot be stepped right now.
function nextStep(n, byId, u, g, res, reserved) {
  const cellOf = d => (u.x + DX[d]) + (u.y + DY[d]) * n.width;
  const t = n.tt[u.type] || {};
  switch (g.kind) {
    case 'train': {
      if (g.count <= 0) return { done: true };
      const cost = n.tt[g.type]?.cost ?? Infinity;
      if (res < cost) return null;
      // A building goes on the side away from the enemy; a unit pops toward the middle of the map.
      const foe = n.units.filter(o => o.player >= 0 && o.player !== n.me).sort((a, b) => manhattan(u, a) - manhattan(u, b) || a.id - b.id)[0];
      const toward = !n.tt[g.type]?.move && foe ? { x: 2 * u.x - foe.x, y: 2 * u.y - foe.y } : { x: (n.width - 1) / 2, y: (n.height - 1) / 2 };
      const d = freeDir(n, u, toward, reserved);
      if (d < 0) return null;
      g.count--;
      return { action: { type: ACT.PRODUCE, parameter: d, unitType: g.type }, done: g.count <= 0, spend: cost, cell: cellOf(d) };
    }
    case 'move': {
      if (u.x === g.x && u.y === g.y) return { done: true };
      const d = bfsStep(n, u, g, { reserved });
      return d < 0 ? null : { action: { type: ACT.MOVE, parameter: d }, cell: cellOf(d) };
    }
    case 'attack': {
      const rng = (t.rng ?? 1) ** 2;
      const foes = n.units.filter(o => o.player >= 0 && o.player !== n.me);
      if (g.target != null) {
        const tgt = byId.get(g.target);
        if (!tgt || tgt.player === n.me || tgt.player < 0) return { done: true };
        if (sqDist(u, tgt) <= rng) return { action: { type: ACT.ATTACK, x: tgt.x, y: tgt.y } };
        const d = bfsStep(n, u, tgt, { adjacent: true, reserved });
        return d < 0 ? null : { action: { type: ACT.MOVE, parameter: d }, cell: cellOf(d) };
      }
      const near = foes.filter(o => sqDist(u, o) <= rng).sort((a, b) => sqDist(u, a) - sqDist(u, b) || a.id - b.id)[0];
      if (near) return { action: { type: ACT.ATTACK, x: near.x, y: near.y } };   // attack-move: anything in range first
      // Standing on the spot is the order, not the end of it: a guard that completed on arrival went idle and let the
      // next enemy walk past it. The goal holds until it is replaced, killing whatever comes into range.
      if (u.x === g.x && u.y === g.y) return {};
      // The cell may be the thing we are sent at — their base fills it. Walking *onto* it can never happen, so a push at
      // an occupied cell stops one step short (game 4: three Light stood a thousand cycles outside a base they never hit).
      const onSpot = n.units.some(o => o.x === g.x && o.y === g.y);
      const d = bfsStep(n, u, g, { reserved, adjacent: onSpot });
      return d < 0 ? null : { action: { type: ACT.MOVE, parameter: d }, cell: cellOf(d) };
    }
    case 'harvest': {
      if (u.carry > 0) {
        const piles = n.units.filter(o => o.player === n.me && n.tt[o.type]?.pile);
        if (!piles.length) return null;
        const p = piles.sort((a, b) => manhattan(u, a) - manhattan(u, b) || a.id - b.id)[0];
        const dir = dirOf(u, p);
        if (dir >= 0) return { action: { type: ACT.RETURN, parameter: dir } };
        const d = bfsStep(n, u, p, { adjacent: true, reserved });
        return d < 0 ? null : { action: { type: ACT.MOVE, parameter: d }, cell: cellOf(d) };
      }
      let node = g.node != null ? byId.get(g.node) : null;
      if (node && !n.tt[node.type]?.res) node = null;
      if (!node) {
        const nodes = n.units.filter(o => n.tt[o.type]?.res);
        if (!nodes.length) return null;
        node = nodes.sort((a, b) => manhattan(u, a) - manhattan(u, b) || a.id - b.id)[0];
        g.node = node.id;   // the named node is gone: fall back to the nearest and keep working
      }
      const dir = dirOf(u, node);
      if (dir >= 0) return { action: { type: ACT.HARVEST, parameter: dir } };
      const d = bfsStep(n, u, node, { adjacent: true, reserved });
      return d < 0 ? null : { action: { type: ACT.MOVE, parameter: d }, cell: cellOf(d) };
    }
    default: return null;
  }
}

// Legality against the newest state, pure, mirroring the engine's own rejections (Unit.getUnitActions +
// GameState.issueSafe, which silently replaces an illegal action with an idle of the same duration — so an
// order that slips through costs the unit its whole action, not nothing).
// Deliberate exception to "drop busy units": a mobile unit is busy for 8-20 of every 10 cycles, so dropping
// its orders would drop most of them. Mobile goals stand in the buffer until the unit is free (orders.mjs);
// only production is dropped on busy, because a producing building genuinely cannot take another produce.
import { inMap, wallAt, freeDir } from './rules.mjs';

export function validate(cmds, state) {
  const n = state.native;
  const byId = new Map(n.units.map(u => [u.id, u]));
  const alive = ids => (ids || []).some(id => { const u = byId.get(id); return u && u.player === n.me && n.tt[u.type]?.move; });
  let res = n.res[n.me] ?? 0;
  const keep = [], dropped = [];
  const drop = (cmd, reason) => dropped.push({ cmd, reason });
  for (const c of cmds) {
    switch (c.cmd) {
      case 'train': {
        const b = byId.get(c.building), t = b && n.tt[b.type];
        if (!b || b.player !== n.me || !t) { drop(c, 'dead'); continue; }
        if (!(t.makes || []).includes(c.type)) { drop(c, 'bad-type'); continue; }   // a Worker produces Base and Barracks: the producer need not be a building
        // Only an in-flight *produce* is protected: issuing over it cancels it and burns the resources. A producer that is
        // merely walking or swinging is fine to order — the goal stands in the buffer and starts the cycle it comes free,
        // which is how a base keeps producing between decisions instead of idling until the next packet.
        if (b.make) { drop(c, 'busy'); continue; }
        const cost = n.tt[c.type]?.cost ?? Infinity;
        if (res < cost) { drop(c, 'poor'); continue; }
        if (freeDir(n, b) < 0) { drop(c, 'boxed'); continue; }
        res -= cost; break;
      }
      case 'harvest': {
        if (!alive(c.units)) { drop(c, 'dead'); continue; }
        if (!c.units.some(id => n.tt[byId.get(id)?.type]?.harv)) { drop(c, 'bad-type'); continue; }
        if (c.node != null && !n.tt[byId.get(c.node)?.type]?.res) { drop(c, 'gone'); continue; }
        if (!n.units.some(u => n.tt[u.type]?.res)) { drop(c, 'gone'); continue; }
        break;
      }
      case 'move': {
        if (!alive(c.units)) { drop(c, 'dead'); continue; }
        if (!inMap(c, n.width, n.height) || wallAt(n, c.x, c.y)) { drop(c, 'wall'); continue; }
        break;
      }
      case 'attack': {
        if (!alive(c.units)) { drop(c, 'dead'); continue; }
        if (!c.units.some(id => n.tt[byId.get(id)?.type]?.atk)) { drop(c, 'bad-type'); continue; }
        if (c.target != null) { const t = byId.get(c.target); if (!t || t.player < 0 || t.player === n.me) { drop(c, 'gone'); continue; } }
        else if (!inMap(c, n.width, n.height) || wallAt(n, c.x, c.y)) { drop(c, 'wall'); continue; }
        break;
      }
      default: drop(c, 'bad-cmd'); continue;
    }
    keep.push(c);
  }
  return { keep, dropped };
}

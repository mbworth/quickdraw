// Legality against the newest state, pure, threading provisional ore/crystal/supply through the list.
import { UNIT_COST, BUILDING_COST, UPGRADE_COST, SELECTORS, isBuilding } from './rules.mjs';

const own = (table, k) => (typeof k === 'string' && Object.hasOwn(table, k) ? table[k] : undefined);   // never the prototype: type:"constructor" is a model string

export function validate(cmds, state) {
  const s = state.native;
  const mine = s.mine || [], byId = new Map(mine.map(e => [e.id, e]));
  const enemy = new Set((s.enemyVisible || []).map(e => e.id));
  const finished = e => e && e.progress === undefined;
  let ore = s.ore, cry = s.crystal, used = s.supply?.used ?? 0;
  const cap = s.supply?.cap ?? 0;
  const keep = [], dropped = [];
  const drop = (cmd, reason) => dropped.push({ cmd, reason });
  const unitsAlive = list => list.some(v => (typeof v === 'string' ? SELECTORS.has(v) : byId.has(v) && !isBuilding(byId.get(v).type)));
  for (const c of cmds) {
    switch (c.cmd) {
      case 'move': case 'stop': case 'disband': case 'gather':
        if (!unitsAlive(c.units)) { drop(c, 'dead'); continue; } break;
      case 'attack':
        if (!unitsAlive(c.units)) { drop(c, 'dead'); continue; }
        if (!enemy.has(c.target)) { drop(c, 'no-target'); continue; } break;
      case 'repair':
        if (!unitsAlive(c.units)) { drop(c, 'dead'); continue; }
        if (!byId.has(c.target)) { drop(c, 'no-target'); continue; } break;
      case 'build': {
        const cost = own(BUILDING_COST, c.type);
        if (cost === undefined) { drop(c, 'bad-type'); continue; }
        if (!unitsAlive(c.workers)) { drop(c, 'dead'); continue; }
        if (ore < cost) { drop(c, 'noore'); continue; }
        ore -= cost; break;
      }
      case 'train': {
        const u = own(UNIT_COST, c.type);
        const b = byId.get(c.building);
        if (!u) { drop(c, 'bad-type'); continue; }
        if (!finished(b) || b.type !== u.from) { drop(c, 'nobld'); continue; }
        if (u.needs && !mine.some(e => e.type === u.needs && finished(e))) { drop(c, 'nobld'); continue; }
        if (used + u.supply > cap) { drop(c, 'capped'); continue; }
        if (ore < u.ore) { drop(c, 'noore'); continue; }
        if (cry < u.cry) { drop(c, 'nocry'); continue; }
        ore -= u.ore; cry -= u.cry; used += u.supply; break;
      }
      case 'research': {
        const b = byId.get(c.building), up = own(UPGRADE_COST, c.key);
        if (!up) { drop(c, 'bad-type'); continue; }
        if (!finished(b) || b.type !== 'armory') { drop(c, 'nobld'); continue; }
        const level = (s.upgrades?.[c.key] || 0) + (b.queue || []).filter(k => k === c.key).length + keep.filter(k => k.cmd === 'research' && k.key === c.key).length;
        if (level >= up.ore.length) { drop(c, 'maxed'); continue; }
        if (ore < up.ore[level]) { drop(c, 'noore'); continue; }
        if (cry < up.cry[level]) { drop(c, 'nocry'); continue; }
        ore -= up.ore[level]; cry -= up.cry[level]; break;
      }
      case 'cancel': case 'rally':
        if (!byId.has(c.building)) { drop(c, 'nobld'); continue; } break;
      default: drop(c, 'bad-cmd'); continue;
    }
    keep.push(c);
  }
  return { keep, dropped };
}

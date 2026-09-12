// Hub events → core triggers, and the pure derive() predicates. No memory here; the core edge-detects.
export const CLASSES = ['danger', 'contact', 'loss', 'idle', 'done', 'economy', 'info'];
export const COOLDOWN_MS = { danger: 2000, contact: 1000 };
import { isBuilding } from './rules.mjs';
export const PURCHASE_LINES = [['worker', 50], ['trooper', 60], ['depot', 75], ['turret', 110], ['barracks', 120]];
const cell = u => `${Math.floor(u.x / 20)},${Math.floor(u.z / 20)}`;

// toTrigger(ev, team) → {cls, key, urgency?, native, gt}
export function toTrigger(ev, team) {
  const base = { native: ev, gt: ev.t, count: ev.count };
  switch (ev.kind) {
    case 'attacked': return { ...base, cls: 'danger', key: String(ev.id), urgency: isBuilding(ev.type) ? 0 : 0.5 };
    case 'sighted': return { ...base, cls: 'contact', key: ev.units?.[0] ? cell(ev.units[0]) : '-' };
    case 'died': return { ...base, cls: ev.team === team ? 'loss' : 'info', key: String(ev.id) };
    case 'idle': return { ...base, cls: 'idle', key: String(ev.id) };
    case 'built': case 'placed': case 'trained': case 'cancelled': case 'research': return { ...base, cls: 'done', key: ev.kind === 'research' ? 'research' : String(ev.id) };
    case 'bust': return { ...base, cls: 'economy', key: 'bust' };
    default: return { ...base, cls: 'info', key: ev.kind };
  }
}

export function derive(state) {
  const s = state.native, out = [];
  for (const b of s.mine || []) {
    if ((b.type === 'barracks' || b.type === 'core') && b.progress === undefined && !(b.queue || []).length) out.push({ cls: 'idle', key: `b${b.id}` });
    if (isBuilding(b.type) && b.progress === undefined && b.max && b.hp / b.max < 0.6) out.push({ cls: 'danger', key: `hp${b.id}`, urgency: 0 });
  }
  for (const [what, cost] of PURCHASE_LINES) if (s.ore >= cost) out.push({ cls: 'economy', key: `ore${what}` });
  if (s.crystal >= 40) out.push({ cls: 'economy', key: 'cry40' });
  if (s.supply && s.supply.cap - s.supply.used <= 2) out.push({ cls: 'economy', key: 'supply' });
  return out;
}

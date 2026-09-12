// Allowlist scrub for committed fixtures: only fields the coder, expand and validate read; ids renumbered
// from 1; name, seed, player and chat dropped. One IdMap per capture keeps ids consistent across fixtures.
export const STATE_KEYS = ['game', 'team', 'size', 'time', 'ore', 'crystal', 'supply', 'upgrades', 'started', 'queued', 'gameOver', 'winner', 'eliminationIn', 'enemyEliminationIn', 'myBase', 'mine', 'enemyVisible', 'enemyBuildingsRemembered', 'fields'];
export const ENTITY_KEYS = ['id', 'type', 'x', 'z', 'team', 'elev', 'hp', 'max', 'progress', 'queue', 'prog', 'rally', 'state', 'entrenched', 'target', 'goal', 'attackMove', 'carry', 'carryKind', 'lastSeen'];
export const FIELD_KEYS = ['x', 'z', 'kind', 'res', 'live', 'seen', 'ore', 'nodes'];
export const NODE_KEYS = ['id', 'amount', 'seen'];
export const EVENT_KEYS = ['seq', 't', 'kind', 'id', 'type', 'x', 'z', 'hp', 'by', 'why', 'units', 'upgrades', 'team', 'seconds', 'reset', 'winner', 'minutes', 'pos'];
export const BRIEF_KEYS = ['id', 'type', 'x', 'z', 'team', 'elev', 'hp', 'max'];
export const UPGRADE_KEYS = ['weapons', 'armor', 'optics', 'excavate', 'refine'];

export function createIdMap() {
  const ents = new Map(), nodes = new Map();
  const map = (m, id) => { if (id == null) return id; if (!m.has(id)) m.set(id, m.size + 1); return m.get(id); };
  return { ent: id => map(ents, id), node: id => map(nodes, id), get size() { return ents.size; } };
}

const pick = (obj, keys) => { const o = {}; for (const k of keys) if (obj[k] !== undefined) o[k] = obj[k]; return o; };

export function scrubEntity(e, ids) {
  const o = pick(e, ENTITY_KEYS);
  o.id = ids.ent(e.id);
  if (o.target !== undefined) o.target = ids.ent(o.target);
  if (o.queue) o.queue = o.queue.slice();
  if (o.goal) o.goal = { x: o.goal.x, z: o.goal.z };
  if (o.rally) o.rally = { x: o.rally.x, z: o.rally.z };
  return o;
}
export function scrubState(s, ids = createIdMap()) {
  const o = pick(s, STATE_KEYS);
  o.game = 1;
  o.upgrades = pick(s.upgrades || {}, UPGRADE_KEYS);
  o.myBase = { x: s.myBase.x, z: s.myBase.z };
  o.mine = (s.mine || []).map(e => scrubEntity(e, ids));
  o.enemyVisible = (s.enemyVisible || []).map(e => scrubEntity(e, ids));
  o.enemyBuildingsRemembered = (s.enemyBuildingsRemembered || []).map(e => scrubEntity(e, ids));
  o.fields = (s.fields || []).map(f => ({ ...pick(f, FIELD_KEYS), nodes: (f.nodes || []).map(n => ({ ...pick(n, NODE_KEYS), id: ids.node(n.id) })) }));
  return o;
}
export function scrubEvent(ev, ids) {
  if (ev.kind === 'chat') return null;
  const o = pick(ev, EVENT_KEYS);
  if (o.id !== undefined) o.id = ids.ent(o.id);
  if (o.by) o.by = { ...pick(o.by, BRIEF_KEYS), id: ids.ent(o.by.id) };
  if (o.units) o.units = o.units.map(u => ({ ...pick(u, BRIEF_KEYS), id: ids.ent(u.id) }));
  if (o.upgrades) o.upgrades = pick(o.upgrades, UPGRADE_KEYS);
  return o;
}

// Walks a scrubbed value, returning every key path that is not allowlisted (empty = clean).
export function strayKeys(fixture) {
  const bad = [];
  const check = (obj, allowed, path) => { for (const k of Object.keys(obj)) if (!allowed.includes(k)) bad.push(`${path}.${k}`); };
  const ent = (e, p) => { check(e, ENTITY_KEYS, p); };
  const s = fixture.state;
  check(s, STATE_KEYS, 'state');
  check(s.upgrades || {}, UPGRADE_KEYS, 'state.upgrades');
  check(s.myBase || {}, ['x', 'z'], 'state.myBase');
  for (const list of ['mine', 'enemyVisible', 'enemyBuildingsRemembered']) (s[list] || []).forEach((e, i) => ent(e, `state.${list}[${i}]`));
  (s.fields || []).forEach((f, i) => { check(f, FIELD_KEYS, `state.fields[${i}]`); (f.nodes || []).forEach((n, j) => check(n, NODE_KEYS, `state.fields[${i}].nodes[${j}]`)); });
  (fixture.events || []).forEach((ev, i) => { check(ev, EVENT_KEYS, `events[${i}]`); if (ev.by) check(ev.by, BRIEF_KEYS, `events[${i}].by`); (ev.units || []).forEach((u, j) => check(u, BRIEF_KEYS, `events[${i}].units[${j}]`)); if (ev.upgrades) check(ev.upgrades, UPGRADE_KEYS, `events[${i}].upgrades`); });
  return bad;
}
export const LEAK = /ash_|@|[a-f0-9]{16}/;

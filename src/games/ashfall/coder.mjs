// ctl state → packet layers. Fixed order, integers only, vocabulary from abbr.mjs. Deterministic.
import { diffById } from '../../core/digest.mjs';
import { cluster, nearest, dist } from '../../lib/cluster.mjs';
import { TYPE, STATE, UPGRADE, FIELD_KIND, IDLE_WHY, TAG, errCode } from './abbr.mjs';
import { isBuilding } from './rules.mjs';

const R = Math.round;
const ty = t => TYPE[t] || t;
const ref = e => `${ty(e.type)}#${e.id}`;
const pos = e => `${R(e.x)},${R(e.z)}`;
const clock = t => { const s = Math.max(0, R(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const pct = (a, b) => (b ? R((100 * a) / b) : 0);
const unitsOf = s => (s.mine || []).filter(e => !isBuilding(e.type));
const bldsOf = s => (s.mine || []).filter(e => isBuilding(e.type));
const done = e => e.progress === undefined;

export function header(s) {
  const parts = [`t${clock(s.time)}`, `o${R(s.ore)}`, `c${R(s.crystal)}`, `s${s.supply?.used ?? 0}/${s.supply?.cap ?? 0}`];
  if (s.supply && s.supply.used >= s.supply.cap) parts.push('CAPPED');
  const ups = Object.entries(s.upgrades || {}).filter(([, v]) => v > 0).map(([k, v]) => `${UPGRADE[k] || k}${v}`);
  if (ups.length) parts.push('up', ...ups);
  if (s.eliminationIn != null) parts.push(`elim me ${R(s.eliminationIn)}`);
  if (s.enemyEliminationIn != null) parts.push(`elim them ${R(s.enemyEliminationIn)}`);
  return parts.join(' ');
}

export function delta(prev, s) {
  if (!prev) return 'none';
  const d = diffById(prev, s, { lists: [
    { name: 'mine', path: 'mine', fields: ['progress', 'queue', 'hp'] },
    { name: 'enemy', path: 'enemyVisible', fields: [] },
    { name: 'mem', path: 'enemyBuildingsRemembered', fields: [] },
  ] });
  const out = [];
  for (const e of d.mine.added) out.push(`+${ref(e)}`);
  for (const e of d.mine.removed) out.push(`-${ref(e)}`);
  for (const c of d.mine.changed) {
    if (c.fields.includes('progress') && done(c.next) && isBuilding(c.next.type)) out.push(`done ${ref(c.next)}`);
    if (c.fields.includes('hp') && c.next.hp < c.prev.hp && isBuilding(c.next.type)) out.push(`${ref(c.next)} hp${pct(c.next.hp, c.next.max)}`);
  }
  for (const c of cluster(d.enemy.added, { r: 8 })) out.push(`E+${ty(c.type)} x${c.n}@${c.x},${c.z}`);
  for (const c of cluster(d.enemy.removed, { r: 8 })) out.push(`E-${ty(c.type)} x${c.n}`);
  for (const e of d.mem.added) out.push(`M+${ref(e)}@${pos(e)}`);
  for (const e of d.mem.removed) out.push(`M-${ref(e)}`);
  const dOre = R(s.ore) - R(prev.ore), dCry = R(s.crystal) - R(prev.crystal);
  if (Math.abs(dOre) >= 50) out.push(`o${dOre > 0 ? '+' : ''}${dOre}`);
  if (Math.abs(dCry) >= 20) out.push(`c${dCry > 0 ? '+' : ''}${dCry}`);
  return out.length ? out.join(' ') : 'none';
}

export function renderTrigger(tr) {
  const n = tr.native || {};
  const x = tr.count > 1 ? ` x${tr.count}` : '';
  const who = n.type ? `${ty(n.type)}#${n.id}` : '';
  switch (tr.cls) {
    case 'danger': return n.kind === 'attacked' ? `dmg ${who} hp${R(n.hp ?? 0)} by ${n.by ? ty(n.by.type) : '?'}${x}` : `hp #${tr.key.replace(/^hp/, '')}`;
    case 'contact': return `seen ${(n.units || []).map(u => ty(u.type)).join(',') || '?'}@${n.units?.[0] ? pos(n.units[0]) : tr.key}${x}`;
    case 'loss': return `lost ${who}${n.by ? ' by ' + ty(n.by.type) : ''}${x}`;
    case 'idle': return n.kind === 'idle' ? `idle ${who} ${IDLE_WHY[n.why] || 'idle'}` : `idle ${tr.key.replace(/^b/, '#')}`;
    case 'done': return n.kind === 'research' ? 'research done' : `${n.kind === 'built' ? 'done' : n.kind === 'cancelled' ? 'cancel' : n.kind || 'done'} ${who}${x}`;
    case 'economy': return n.kind === 'bust' ? `bust ${n.team != null ? (n.reset ? 'reset' : n.seconds ?? '') : ''}`.trim() : tr.key.replace(/^ore/, 'ore ').replace(/^cry40$/, 'cry 40').replace(/^supply$/, 'sup cap');
    case 'info': return n.kind === 'died' ? `kill ${who}${x}` : n.kind === 'chat' ? 'chat' : n.kind || tr.key;
    case 'heartbeat': return 'hb';
    case 'resume': return 'resync';
    default: return `${tr.cls} ${tr.key}`;
  }
}

export function production(s) {
  const lines = [];
  for (const b of bldsOf(s)) {
    if (!done(b)) { lines.push({ text: `${ref(b)} bld ${pct(b.progress, 1)}`, priority: 0 }); continue; }
    if (b.type !== 'core' && b.type !== 'barracks' && b.type !== 'armory') continue;
    const q = b.queue || [];
    const head = q.length ? ` ${ty(q[0])}${b.prog != null ? ' ' + pct(b.prog, 1) : ''}` : ' IDLE';
    lines.push({ text: `${ref(b)} q${q.length}${head}${b.rally ? ` r${R(b.rally.x)},${R(b.rally.z)}` : ''}`, priority: 0 });
  }
  return lines.map(l => l.text).join('; ') || 'none';
}

export function economy(s) {
  const workers = unitsOf(s).filter(u => u.type === 'worker');
  const fields = (s.fields || []).map((f, i) => ({ ...f, i: i + 1 }));
  const parts = [];
  for (const f of fields) {
    const n = workers.filter(w => (w.state === 'gather' || w.state === 'return') && dist(w, f) <= 14).length;
    if (n) parts.push(`f${f.i} ${f.res === 'crystal' ? 'cry' : 'ore'} wk${n}${f.ore != null ? ' o' + R(f.ore) : ''}`);
  }
  const idle = workers.filter(w => w.state === 'idle');
  if (idle.length) parts.push(`idle wk ${idle.map(w => '#' + w.id).join(',')}`);
  return parts.join('; ') || 'none';
}

export function army(s) {
  const units = unitsOf(s);
  const cl = cluster(units, { r: 8 });
  return cl.map(c => `${ty(c.type)} x${c.n}@${c.x},${c.z} ${STATE[c.state] || c.state || '?'}${c.n <= 2 ? ' #' + c.ids.join(',#') : ''}`);
}

export const bldLine = b => `${ref(b)}@${pos(b)} ${done(b) ? `hp${pct(b.hp, b.max)}` : `bld ${pct(b.progress, 1)}`}`;
export function buildings(s, { only = null } = {}) {
  return bldsOf(s).filter(b => !only || only(b)).map(bldLine);
}
const isAnchor = b => b.type === 'core' || b.type === 'turret';
// compact: `co#1@70,4 ba#13 dp#22 tu#30@50,-3 hp58 ba#40 bld40` — what exists, where the anchor is, what is hurt or unfinished
export const compactBuildings = s => bldsOf(s).map(b => `${ref(b)}${isAnchor(b) ? '@' + pos(b) : ''}${!done(b) ? ` bld${pct(b.progress, 1)}` : pct(b.hp, b.max) < 100 ? ` hp${pct(b.hp, b.max)}` : ''}`).join(' ') || 'none';

export function enemy(s) {
  const blds = bldsOf(s), units = unitsOf(s).filter(u => u.type !== 'worker');
  return cluster(s.enemyVisible || [], { r: 8, stateOf: e => (e.entrenched ? 'dug' : undefined) }).map(c => {
    const db = nearest(c, blds).d, da = nearest(c, units).d;
    return `${ty(c.type)} x${c.n}@${c.x},${c.z} d${Number.isFinite(db) ? R(db) : '-'}/${Number.isFinite(da) ? R(da) : '-'}${c.state === 'dug' ? ' dug' : ''}${c.n <= 2 ? ' #' + c.ids.join(',#') : ''}`;
  });
}

export function remembered(s) {
  return (s.enemyBuildingsRemembered || []).map(b => `${ref(b)}@${pos(b)} hp${pct(b.hp, b.max)} age${R(Math.max(0, s.time - (b.lastSeen ?? s.time)))}`);
}

// fold: unexplored fields (no ore seen) collapse into one `f? f3@x,z f11c@x,z` line; positions kept, ~40% of the layer saved
export function fields(s, { fold = false } = {}) {
  const all = (s.fields || []).map((f, i) => ({ f, i: i + 1 }));
  const line = ({ f, i }) => {
    const kind = FIELD_KIND[f.kind] || f.kind;
    const nodes = (f.nodes || []).map(n => n.id);
    const ore = f.ore == null ? '?' : `o${R(f.ore)}`;
    return `f${i} ${kind} ${f.res === 'crystal' ? 'cry' : 'ore'}@${pos(f)} ${ore}${f.live ? ' live' : ''}${nodes.length ? ' n#' + nodes.join(',#') : ''}`;
  };
  if (!fold) return all.map(line);
  const unexplored = all.filter(x => x.f.ore == null);
  const out = all.filter(x => x.f.ore != null).map(line);
  if (unexplored.length) out.push('f? ' + unexplored.map(({ f, i }) => `f${i}${f.res === 'crystal' ? 'c' : ''}@${pos(f)}`).join(' '));
  return out;
}

// an idle harvester or a worked field at 0 ore means the next order is a gather that needs a node id
export function fieldsNeeded(s) {
  const workers = unitsOf(s).filter(u => u.type === 'worker');
  if (workers.some(w => w.state === 'idle')) return true;
  return (s.fields || []).some(f => f.ore === 0 && workers.some(w => (w.state === 'gather' || w.state === 'return') && dist(w, f) <= 14));
}

export function lastOrders(list) {
  if (!list || !list.length) return 'none';
  return list.map(o => {
    const c = o.cmd || {};
    const what = c.cmd === 'train' ? `train ${ty(c.type)} #${c.building}` : c.cmd === 'build' ? `build ${ty(c.type)} ${c.x},${c.z}` : c.cmd === 'move' ? `move ${(c.units || []).length} ${c.x},${c.z}${c.attackMove ? ' am' : ''}` : c.cmd === 'attack' ? `attack #${c.target}` : c.cmd === 'research' ? `research ${UPGRADE[c.key] || c.key}` : c.cmd === 'rally' ? `rally #${c.building}` : c.cmd === 'gather' ? `gather ${(c.units || []).length}${c.ore != null ? ' n#' + c.ore : ''}` : c.cmd || 'cmd';
    return `${what} ${o.ok ? 'ok' : errCode(o.error)}`;
  }).join('; ');
}

const layer = (name, priority, text, extra = {}) => ({ name, priority, text: `${TAG[name]} ${text}`, ...extra });
const lineLayer = (name, priority, items, prio = () => priority, extra = {}) => (items.length ? { name, priority, text: TAG[name], lines: items.map((text, i) => ({ text, priority: prio(i) })), ...extra } : { name, priority, text: `${TAG[name]} none`, ...extra });

// encode({state, prevDecisionState, triggers, lastOrders}, opts) → Layer[]
// opts.foldFields folds unexplored fields into one line; opts.fullBuildings puts the buildings layer on the --full-every cadence;
// opts.fieldsOnDemand keeps fields on every packet while a harvester is idle or a worked field is dry (the decision that needs node ids).
// opts.keepAnchor (with fullBuildings): core and turret lines stay on every packet; the prompt's turret and mirror rules read them.
export function encode({ state, prevDecisionState, triggers = [], lastOrders: lo = [], pending = [] }, { foldFields = false, fullBuildings = false, fieldsOnDemand = false, keepAnchor = false, keepRemembered = false, compactBuildings: compactB = false } = {}) {
  const s = state.native, prev = prevDecisionState?.native || null;
  const fieldsFull = !(fieldsOnDemand && fieldsNeeded(s));
  return [
    layer('header', 0, header(s)),
    layer('delta', 0, delta(prev, s)),
    layer('triggers', 1, triggers.slice(0, 6).map(renderTrigger).join('; ') || 'none'),
    layer('production', 0, production(s)),
    layer('economy', 1, economy(s)),
    lineLayer('army', 2, army(s)),
    ...(compactB ? [layer('buildings', 2, compactBuildings(s))] : fullBuildings && keepAnchor
      ? [lineLayer('buildings', 2, buildings(s, { only: isAnchor })), { name: 'buildings-rest', priority: 2, text: '', lines: buildings(s, { only: b => !isAnchor(b) }).map(text => ({ text, priority: 2 })), full: true }]
      : [lineLayer('buildings', 2, buildings(s), () => 2, fullBuildings ? { full: true } : {})]),
    lineLayer('enemy', 1, enemy(s)),
    // keepRemembered: on every packet at army priority. At 3 it tied with fields and the assembler drops the first tie, so in game 25 the one
    // line holding the enemy base position reached the model on 1 packet of 118 and the ball went to the prompt's example coordinates 14 times.
    lineLayer('remembered', keepRemembered ? 2 : 3, remembered(s), () => (keepRemembered ? 2 : 3), keepRemembered ? {} : { full: true }),
    lineLayer('fields', 3, fields(s, { fold: foldFields }), () => 3, fieldsFull ? { full: true } : {}),
    layer('last', 0, lastOrders(lo) + (pending.length ? `; pending: ${pending.map(set => set.slice(0, 4).map(renderTrigger).join(', ')).join(' | ')}` : '')),   // --overlap: calls already in flight, by their triggers
  ];
}

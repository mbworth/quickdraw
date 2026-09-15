// Materialized state → packet layers. Fixed order, integers only, vocabulary from abbr.mjs. Deterministic and
// pure over the snapshot, so bin/replay.mjs reproduces every packet from the run file alone (the type table
// rides on the state as `tt` for exactly that reason).
import { diffById } from '../../core/digest.mjs';
import { cluster, nearest } from '../../lib/cluster.mjs';
import { TYPE, STATE, TAG, errCode } from './abbr.mjs';
import { manhattan } from './rules.mjs';
import { encodeOrder } from './lang.mjs';

const ty = t => TYPE[t] || t;
const ref = u => `${ty(u.type)}#${u.id}`;
const at = u => `${u.x},${u.y}`;
const flat = u => ({ ...u, z: u.y, hp: u.hp, max: 0 });   // lib/cluster works in x,z
export const isBld = (n, u) => !n.tt[u.type]?.move && !n.tt[u.type]?.res;
export const mine = n => n.units.filter(u => u.player === n.me);
export const foes = n => n.units.filter(u => u.player >= 0 && u.player !== n.me);
export const nodes = n => n.units.filter(u => n.tt[u.type]?.res);
export const army = n => mine(n).filter(u => n.tt[u.type]?.move);
export const blds = n => mine(n).filter(u => isBld(n, u));
export const home = n => blds(n).find(u => n.tt[u.type]?.pile) || blds(n)[0] || army(n)[0] || null;
const dTo = (p, list) => { const b = list.reduce((a, u) => Math.min(a, manhattan(p, u)), Infinity); return Number.isFinite(b) ? b : null; };

// Each layer has one source: a *Facts function that computes it, and a renderer that prints those facts. facts.mjs calls
// the first, encode calls the second, so the two sides of the fidelity oracle (bin/oracle.mjs) cannot drift.
export const headerFacts = n => ({ t: n.cycle, r: n.res[n.me] ?? 0, u: army(n).length, them: foes(n).filter(u => n.tt[u.type]?.move).length });
export const header = n => { const f = headerFacts(n); return `t${f.t} r${f.r} u${f.u}/${f.them}`; };

export function delta(prev, n) {
  if (!prev) return 'none';
  const d = diffById(prev, n, { lists: [{ name: 'u', path: 'units', fields: ['hp'] }] }).u;
  const out = [];
  for (const u of d.added) out.push(`${u.player === n.me ? '+' : 'E+'}${ref(u)}`);
  for (const u of d.removed) { if (prev.tt[u.type]?.res) continue; out.push(`${u.player === prev.me ? '-' : 'E-'}${ref(u)}`); }
  for (const c of d.changed) if (c.next.hp < c.prev.hp) out.push(`${c.next.player === n.me ? '' : 'E'}${ref(c.next)} hp${c.next.hp}`);
  const dr = (n.res[n.me] ?? 0) - (prev.res[prev.me] ?? 0);
  if (dr) out.push(`r${dr > 0 ? '+' : ''}${dr}`);
  return out.length ? out.join(' ') : 'none';
}

export function renderTrigger(tr) {
  const v = tr.native || {}, x = tr.count > 1 ? ` x${tr.count}` : '';
  const who = v.type ? `${ty(v.type)}#${v.id}` : '';
  switch (tr.cls) {
    case 'danger': return v.kind === 'dmg' ? `dmg ${who} hp${v.hp}${x}` : `hp #${tr.key.replace(/^hp/, '')}`;
    case 'contact': return `seen at ${tr.key}${x}`;
    case 'loss': return `lost ${who}${x}`;
    case 'idle': return `idle #${tr.key.replace(/^u/, '')}`;
    case 'done': return `done ${who}${x}`;
    case 'economy': return tr.key.startsWith('b') ? `IDLE #${tr.key.slice(1)}` : `r ${ty(tr.key.slice(1))}`;
    case 'info': return v.kind === 'kill' ? `kill ${who}${x}` : v.kind || tr.key;
    case 'heartbeat': return 'hb';
    case 'resume': return 'resync';
    default: return `${tr.cls} ${tr.key}`;
  }
}

// P: what each of my buildings is doing and how many cycles are left; IDLE is the line the economy trigger fires on.
export const productionFacts = n => blds(n).map(b => {
  const make = b.make ? ty(b.make) : null;                       // a two-letter unit code means producing; one letter is the building's own action
  return { type: ty(b.type), id: b.id, make, st: b.busy ? make || STATE[b.st] || '?' : null, eta: b.busy ? b.eta : null, idle: !b.busy };
});
export const production = n => productionFacts(n).map(b => `${b.type}#${b.id} ${b.idle ? 'IDLE' : `${b.st} ${b.eta}`}`).join('; ') || 'none';

// E: the resource nodes, what is left in each and how far my base is from it.
export const economyFacts = n => { const h = home(n); return nodes(n).map(r => ({ type: ty(r.type), id: r.id, x: r.x, y: r.y, o: r.carry, d: h ? manhattan(h, r) : null })); };
export const economy = n => economyFacts(n).map(r => `${r.type}#${r.id}@${r.x},${r.y} o${r.o}${r.d != null ? ` d${r.d}` : ''}`);

export const armyClusters = n => cluster(army(n).map(flat), { r: 2, stateOf: u => u.st })
  .map(c => ({ type: ty(c.type), n: c.n, x: c.x, y: c.z, state: STATE[c.state] || '?', ids: c.ids, label: `${ty(c.type)} x${c.n}@${c.x},${c.z}` }));   // A always lists ids: on a 16x16 board they cost a few characters and they are the only way an order can name one unit
export const armyLines = n => armyClusters(n).map(c => `${c.label} ${c.state}${c.ids.length ? ' #' + c.ids.join(',#') : ''}`);

export const buildingFacts = n => blds(n).map(b => ({ type: ty(b.type), id: b.id, x: b.x, y: b.y, hp: b.hp }));
export const buildings = n => buildingFacts(n).map(b => `${b.type}#${b.id}@${b.x},${b.y} hp${b.hp}`).join(' ') || 'none';

// X: enemies clustered, with steps to my base and to my nearest unit — the two numbers every order reads.
export function enemyFacts(n) {
  const h = home(n), my = army(n);
  return cluster(foes(n).map(flat), { r: 2, stateOf: u => u.st }).map(c => ({
    type: ty(c.type), n: c.n, x: c.x, y: c.z, dB: h ? manhattan(h, { x: c.x, y: c.z }) : null, dA: dTo({ x: c.x, y: c.z }, my),
    ids: c.n <= 2 ? c.ids : [], label: `${ty(c.type)} x${c.n}@${c.x},${c.z}`,
  }));
}
export const enemy = n => enemyFacts(n).map(c => `${c.label} d${c.dB ?? '-'}/${c.dA ?? '-'}${c.ids.length ? ' #' + c.ids.join(',#') : ''}`);

export const lastOrders = list => (!list?.length ? 'none' : list.map(o => `${encodeOrder(o.cmd || {})} ${o.ok ? 'ok' : errCode(o.error)}`).join('; '));

const layer = (name, priority, text, extra = {}) => ({ name, priority, text: `${TAG[name]} ${text}`, ...extra });
const lineLayer = (name, priority, items, extra = {}) => (items.length ? { name, priority, text: TAG[name], lines: items.map(text => ({ text, priority })), ...extra } : { name, priority, text: `${TAG[name]} none`, ...extra });

// encode({state, prevDecisionState, triggers, lastOrders}) → Layer[]
export function encode({ state, prevDecisionState, triggers = [], lastOrders: lo = [], pending = [] }) {
  const n = state.native, prev = prevDecisionState?.native || null;
  return [
    layer('header', 0, header(n)),
    layer('delta', 0, delta(prev, n)),
    layer('triggers', 1, triggers.slice(0, 6).map(renderTrigger).join('; ') || 'none'),
    layer('production', 0, production(n)),
    lineLayer('economy', 1, economy(n)),
    lineLayer('army', 2, armyLines(n)),
    layer('buildings', 2, buildings(n)),
    lineLayer('enemy', 1, enemy(n)),
    layer('last', 0, lastOrders(lo) + (pending.length ? `; ${pending.map(s => s.slice(0, 4).map(renderTrigger).join(', ')).join(' | ')}` : '')),
  ];
}

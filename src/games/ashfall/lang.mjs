// Order language (--ashfall-lang true): the model returns one string instead of a JSON list of objects; decode() turns it
// into the same order objects expand and validate already take. JSON keys and quoted ids were ~60% of output tokens.
//   t <bld> <type> [n]   b <type> <x,z> [harvesters]   m <units> <x,z>   am <units> <x,z>   a <units> <enemy>   s <units>
//   g <harvesters> [node]   r <harvesters> <target>   rs <bld> <key>   ry <bld> <x,z>|-   c <bld>   d <units>
// Commands are ';'-separated; units are comma-joined ids/selectors or one cluster label pasted from A (`tr x5@39,1`).
// Anything unparseable becomes {cmd:'?', text} and expand drops it as bad-cmd, so a typo costs one order, never the batch.
import { UNIT, BUILDING, UPGRADE } from './abbr.mjs';
import { coerceId } from './expand.mjs';

export const toolLang = Object.freeze({
  type: 'object',
  properties: { o: { type: 'string', description: 'orders in the order language from the system prompt, ";"-separated; empty when nothing is worth ordering. e.g. "t 12 tr 3; am army 65,25"' } },
  required: ['o'],
  additionalProperties: false,
});

const VERB = { t: 'train', train: 'train', b: 'build', build: 'build', m: 'move', move: 'move', am: 'am', attackmove: 'am', 'attack-move': 'am', a: 'attack', attack: 'attack', s: 'stop', stop: 'stop', g: 'gather', gather: 'gather', r: 'repair', repair: 'repair', rs: 'research', research: 'research', ry: 'rally', rally: 'rally', c: 'cancel', cancel: 'cancel', d: 'disband', disband: 'disband' };
const inv = t => Object.fromEntries(Object.entries(t).map(([k, v]) => [v, k]));
const UNIT_CODE = inv(UNIT), BLD_CODE = inv(BUILDING), UPG_CODE = inv(UPGRADE);
const own = (t, k) => (typeof k === 'string' && Object.hasOwn(t, k) ? t[k] : undefined);
const typeOf = (tok, codes, names) => { const k = (tok || '').toLowerCase(); return own(codes, k) ?? (Object.hasOwn(names, k) ? k : null); };
const POS = /^(-?\d+),(-?\d+)$/;
const LABEL = /[a-z]{2} x\d+@-?\d+,-?\d+/g;   // a cluster label pasted from A
const TOKEN = /\x01\S*|\S+/g;
const pos = tok => { const m = POS.exec(tok || ''); return m ? { x: Number(m[1]), z: Number(m[2]) } : null; };
const SELECTOR_OF_CODE = { wk: 'workers', tr: 'troopers', rd: 'raiders', wd: 'wardens', sg: 'siege' };   // the model writes the type code as a selector
const units = tok => (tok ? tok.split(',').filter(Boolean).map(v => (v.startsWith('\x01') ? v.slice(1).replace('\x02', ' ').replace('\x03', ',') : own(SELECTOR_OF_CODE, v.toLowerCase()) || v)) : []);
const int = tok => { if (tok == null) return null; const id = coerceId(tok.replace(/^n#?/i, '#')); return id; };
// The model glues trailing arguments onto the unit list with commas (`am tr x11@46,34,49,50`, `r idle,tr x12@64,24,33`): when the
// verb's trailing arguments are missing, peel that many comma pieces off the end of the unit token.
const peel = (toks, n) => { if (toks.length > n + 1 || !toks[1]) return toks; const parts = toks[1].split(','); if (parts.length <= n) return toks; return [toks[0], parts.slice(0, -n).join(','), ...parts.slice(-n)]; };

export function parseOne(text) {
  const marked = text.replace(LABEL, m => '\x01' + m.replace(' ', '\x02').replace(',', '\x03'));   // a label becomes one token with no space or comma, so it survives both splits
  let toks = marked.match(TOKEN) || [];
  if (!toks.length) return null;
  const verb = own(VERB, toks[0].toLowerCase()), bad = { cmd: '?', text };
  if (verb === 'move' || verb === 'am') { const t = peel(toks, 2); toks = pos(t.slice(-2).join(',')) ? [t[0], t[1], t.slice(-2).join(',')] : toks; }
  else if (verb === 'attack' || verb === 'repair') toks = peel(toks, 1);
  const [, a1, a2, a3] = toks;
  switch (verb) {
    case 'train': { const type = typeOf(a2, UNIT_CODE, UNIT); const building = int(a1); if (!type || building === null) return bad; return { cmd: 'train', building, type, count: Math.max(1, Math.min(5, Number(a3) || 1)) }; }
    case 'build': { const type = typeOf(a1, BLD_CODE, BUILDING), p = pos(a2); if (!type || !p) return bad; return { cmd: 'build', workers: a3 ? units(toks.slice(3).join(' ')) : ['workers'], type, ...p }; }
    case 'move': case 'am': { const u = units(a1), p = pos(a2) || pos(a3); if (!u.length || !p) return bad; const flag = verb === 'am' || /^am?$/i.test(a3 || '') || (!!pos(a3) && /^am?$/i.test(a2 || '')); return { cmd: 'move', units: u, ...p, attackMove: flag }; }
    case 'attack': case 'repair': { const u = units(a1), target = int(a2); if (!u.length || target === null) return bad; return { cmd: verb, units: u, target }; }
    case 'stop': case 'disband': { const u = units(toks.slice(1).join(' ')); if (!u.length) return bad; return { cmd: verb, units: u }; }
    case 'gather': { const u = units(a1); if (!u.length) return bad; const ore = a2 && a2 !== '-' ? int(a2) : null; return { cmd: 'gather', units: u, ore }; }
    case 'research': { const building = int(a1), key = typeOf(a2, UPG_CODE, UPGRADE); if (building === null || !key) return bad; return { cmd: 'research', building, key }; }
    case 'rally': { const building = int(a1); if (building === null) return bad; const p = pos(a2); if (!p && a2 !== '-' && a2 !== undefined) return bad; return { cmd: 'rally', building, x: p?.x ?? null, z: p?.z ?? null }; }
    case 'cancel': { const building = int(a1); if (building === null) return bad; return { cmd: 'cancel', building }; }
    default: return bad;
  }
}

// decode(input) → {act, orders, note}: the model.mjs seam; input is the tool_use input.
export function decode(input) {
  const o = (typeof input?.o === 'string' ? input.o : '').replace(/<\/?[a-z][^>]*>/gi, '').replace(/`+\w*/g, '').trim();   // game 25: the model leaks its tool-call closing tag into the string on ~5% of calls; not an order. Backticks/fences: a text reply (--reply text) may wrap the line
  const parts = o.split(';').map(s => s.trim()).filter(s => s && !/^(-|none|no-?op)$/i.test(s));
  const orders = parts.map(parseOne).filter(Boolean);
  return { act: orders.length > 0, orders, note: null };
}

// encodeOrder(order) → the language line for one order object (tests, and the L layer under --ashfall-lang).
export function encodeOrder(c) {
  const p = `${c.x},${c.z}`, u = (c.units || []).join(',');
  switch (c.cmd) {
    case 'train': return `t ${c.building} ${UNIT[c.type] || c.type}${c.count && c.count !== 1 ? ' ' + c.count : ''}`;
    case 'build': return `b ${BUILDING[c.type] || c.type} ${p}${(c.workers || []).join(',') !== 'workers' ? ' ' + (c.workers || []).join(',') : ''}`;
    case 'move': return `${c.attackMove ? 'am' : 'm'} ${u} ${p}`;
    case 'attack': case 'repair': return `${c.cmd === 'attack' ? 'a' : 'r'} ${u} ${c.target}`;
    case 'stop': return `s ${u}`;
    case 'disband': return `d ${u}`;
    case 'gather': return `g ${u}${c.ore != null ? ' ' + c.ore : ''}`;
    case 'research': return `rs ${c.building} ${UPGRADE[c.key] || c.key}`;
    case 'rally': return `ry ${c.building} ${c.x == null ? '-' : p}`;
    case 'cancel': return `c ${c.building}`;
    default: return c.cmd;
  }
}

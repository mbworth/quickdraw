// Order language: the model returns one string; decode() turns it into the order objects expand and validate take.
//   t <bldId> <unit> [n]           produce n of <unit> at that building (a standing order: MicroRTS has no queue)
//   h <units> [nodeId]             harvest that node, or the nearest one, and keep returning it forever
//   m <units> <x>,<y>              walk there
//   a <units> <x>,<y>|<unitId>     attack-move to that cell, or hunt that unit
//   -                              nothing
// Commands are ';'-separated; units are comma-joined ids/selectors (all idle wk li hv rg) or one cluster label
// pasted from A/X (`wk x2@1,1`). Anything unparseable becomes {cmd:'?'} and expand drops it as bad-cmd, so a
// typo costs one order, never the batch.
import { NAME, TYPE } from './abbr.mjs';

const VERB = { t: 'train', train: 'train', h: 'harvest', harvest: 'harvest', m: 'move', move: 'move', a: 'attack', attack: 'attack' };
export const SELECTORS = new Set(['all', 'idle', ...Object.values(TYPE)]);
const POS = /^(-?\d+),(-?\d+)$/;
const LABEL = /[a-z]{2} x\d+@-?\d+,-?\d+(?: [imhrpa](?=[ ,;]|$))?/g;   // a cluster label pasted from the packet, with or without its state letter
const TOKEN = /\x01\S*|\S+/g;
const own = (t, k) => (typeof k === 'string' && Object.hasOwn(t, k) ? t[k] : undefined);
const pos = tok => { const m = POS.exec(tok || ''); return m ? { x: Number(m[1]), y: Number(m[2]) } : null; };
export const coerceId = v => {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') { const m = /^(?:[a-z]{2})?#?(\d+)$/i.exec(v.trim()); if (m) return Number(m[1]); }
  return null;
};
const units = tok => (tok ? tok.split(',').filter(Boolean).map(v => (v.startsWith('\x01') ? v.slice(1).replace('\x02', ' ').replace('\x03', ',') : v.toLowerCase())) : []);

export function parseOne(text) {
  const marked = text.replace(/\s*,\s*/g, ',').replace(LABEL, m => '\x01' + m.replace(/ [imhrpa]$/, '').replace(' ', '\x02').replace(',', '\x03'));
  const toks = marked.match(TOKEN) || [];
  if (!toks.length) return null;
  const verb = own(VERB, toks[0].toLowerCase()), bad = { cmd: '?', text };
  const [, a1, a2, a3] = toks;
  switch (verb) {
    case 'train': { const building = coerceId(a1), type = own(NAME, (a2 || '').toLowerCase()); if (building === null || !type) return bad; return { cmd: 'train', building, type, count: Math.max(1, Math.min(5, Number(a3) || 1)) }; }
    case 'harvest': { const u = units(a1); if (!u.length) return bad; const node = a2 && a2 !== '-' ? coerceId(a2) : null; return { cmd: 'harvest', units: u, node }; }
    case 'move': { const u = units(a1), p = pos(a2); if (!u.length || !p) return bad; return { cmd: 'move', units: u, ...p }; }
    case 'attack': { const u = units(a1); if (!u.length) return bad; const p = pos(a2); if (p) return { cmd: 'attack', units: u, ...p }; const target = coerceId(a2); if (target === null) return bad; return { cmd: 'attack', units: u, target }; }
    default: return bad;
  }
}

// decode(input) → {act, orders, note}: the model.mjs seam; input is the tool_use input.
export function decode(input) {
  const o = (typeof input?.o === 'string' ? input.o : '').replace(/<\/?[a-z][^>]*>/gi, '').replace(/`+\w*/g, '').trim();
  const parts = o.split(';').map(s => s.trim()).filter(s => s && !/^(-|none|no-?op)$/i.test(s));
  const orders = parts.map(parseOne).filter(Boolean);
  return { act: orders.length > 0, orders, note: null };
}

// encodeOrder(order) → the language line for one order object (tests, and the L layer).
export function encodeOrder(c) {
  const u = (c.units || []).map(v => (typeof v === 'number' ? '#' + v : v)).join(',');
  switch (c.cmd) {
    case 'train': return `t ${c.building} ${TYPE[c.type] || c.type}${c.count && c.count !== 1 ? ' ' + c.count : ''}`;
    case 'harvest': return `h ${u}${c.node != null ? ' #' + c.node : ''}`;
    case 'move': return `m ${u} ${c.x},${c.y}`;
    case 'attack': return `a ${u} ${c.target != null ? '#' + c.target : `${c.x},${c.y}`}`;
    default: return c.cmd;
  }
}

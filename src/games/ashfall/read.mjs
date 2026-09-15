// Packet text → facts. The inverse of coder.mjs for everything a policy reads, so a scripted decider sees exactly what the
// model sees: the text, nothing from the state. Structured layers (H P E A B X M F) are strict: an unrecognised token throws
// ReadError, so a packet the script cannot read is a visible failure. Event layers (D T L) have open vocabularies and are
// classified by first word.
import { TAG } from './abbr.mjs';

export class ReadError extends Error { constructor(layer, line) { super(`read: ${layer}: ${line}`); this.layer = layer; this.line = line; } }
const bad = (layer, line) => { throw new ReadError(layer, line); };
const N = s => Number(s);
const ID = /^([a-z]{2})#(\d+)$/;
const ids = s => s.split(',').map(x => N(x.replace('#', '')));
const LAYER = Object.fromEntries(Object.entries(TAG).map(([k, v]) => [v, k]));

function header(text) {
  const h = { t: 0, o: 0, c: 0, sUsed: 0, sCap: 0, capped: false, wk: null, tr: null, up: {}, elimMe: null, elimThem: null };
  const toks = text.split(' ');
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i]; let m;
    if ((m = /^t(\d+):(\d\d)$/.exec(k))) h.t = N(m[1]) * 60 + N(m[2]);
    else if ((m = /^o(-?\d+)$/.exec(k))) h.o = N(m[1]);
    else if ((m = /^c(-?\d+)$/.exec(k))) h.c = N(m[1]);
    else if ((m = /^s(\d+)\/(\d+)$/.exec(k))) { h.sUsed = N(m[1]); h.sCap = N(m[2]); }
    else if (k === 'CAPPED') h.capped = true;
    else if ((m = /^wk(\d+)$/.exec(k))) h.wk = N(m[1]);
    else if ((m = /^tr(\d+)$/.exec(k))) h.tr = N(m[1]);
    else if (k === 'up') { while (toks[i + 1] && /^[waoxr]\d+$/.test(toks[i + 1])) { const u = toks[++i]; h.up[u[0]] = N(u.slice(1)); } }
    else if (k === 'elim') { const who = toks[++i], n = N(toks[++i]); if (who === 'me') h.elimMe = n; else if (who === 'them') h.elimThem = n; else bad('H', text); }
    else bad('H', text);
  }
  return h;
}

// D: `+tr#12 -wk#4 done ba#3 ba#3 hp50 E+tr x7@-9,-1 E-tr x1 M+ba#12@22,49 M-ba#12 o+120 c-20`
export function delta(text) {
  const d = { items: [], enemyGone: false, lost: [], gained: [] };
  if (text === 'none') return d;
  const toks = text.split(' ');
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i]; let m;
    if ((m = /^([+-])([a-z]{2})#(\d+)$/.exec(k))) { const it = { kind: m[1] === '+' ? 'gained' : 'lost', type: m[2], id: N(m[3]) }; d.items.push(it); (m[1] === '+' ? d.gained : d.lost).push(it); }
    else if (k === 'done') d.items.push({ kind: 'done', ref: toks[++i] });
    else if ((m = /^E([+-])([a-z]{2})$/.exec(k))) { const rest = toks[++i]; if (m[1] === '-') d.enemyGone = true; d.items.push({ kind: m[1] === '+' ? 'enemyNew' : 'enemyGone', type: m[2], text: rest }); }
    else if ((m = /^M([+-])/.exec(k))) d.items.push({ kind: m[1] === '+' ? 'memNew' : 'memGone', text: k.slice(2) });
    else if ((m = /^([oc])([+-]\d+)$/.exec(k))) d.items.push({ kind: m[1] === 'o' ? 'ore' : 'crystal', n: N(m[2]) });
    else if (ID.test(k) && /^hp\d+$/.test(toks[i + 1] || '')) d.items.push({ kind: 'hurt', ref: k, hp: N(toks[++i].slice(2)) });
    else d.items.push({ kind: 'other', text: k });
  }
  return d;
}

// T: `; `-separated events, classified by first word; `x3` = repeated
export function triggers(text) {
  const t = { items: [], kill: false, supCap: false, idleWk: [], none: text === 'none' };
  if (t.none) return t;
  for (const raw of text.split('; ')) {
    const toks = raw.replace(/ x\d+$/, '').split(' ');
    const it = { kind: toks[0], text: raw };
    if (toks[0] === 'kill') t.kill = true;
    else if (toks[0] === 'sup' && toks[1] === 'cap') t.supCap = true;
    else if (toks[0] === 'idle') { const m = ID.exec(toks[1] || ''); if (m && m[1] === 'wk') { it.id = N(m[2]); it.why = toks[2]; t.idleWk.push(it.id); } else if (/^#\d+$/.test(toks[1] || '')) it.building = N(toks[1].slice(1)); }
    else if (toks[0] === 'ore') it.what = toks[1];
    t.items.push(it);
  }
  return t;
}

// P: `co#1 q0 IDLE; ba#13 q2 tr 70 r58,4 out; ba#40 bld 60`
const PROD = /^([a-z]{2})#(\d+) (?:bld (\d+)|q(\d+)(?: (?:IDLE|([a-z]{2})(?: (\d+))?))?(?: r(-?\d+),(-?\d+)( out)?( failed)?)?)$/;
function production(text) {
  if (text === 'none') return [];
  return text.split('; ').map(item => {
    const m = PROD.exec(item) || bad('P', item);
    const b = { type: m[1], id: N(m[2]), bld: m[3] != null ? N(m[3]) : null, q: m[4] != null ? N(m[4]) : null, head: m[5] || null, prog: m[6] != null ? N(m[6]) : null, rally: m[7] != null ? { x: N(m[7]), z: N(m[8]) } : null, out: !!m[9], failed: !!m[10] };
    b.done = b.bld === null; b.idle = b.done && b.q === 0;
    return b;
  });
}

// E: `f1 ore wk3 o2500; f2 cry wk2; idle wk #9,#11`
function economy(text) {
  const e = { fields: [], idleWk: [] };
  if (text === 'none') return e;
  for (const item of text.split('; ')) {
    let m;
    if ((m = /^f(\d+) (ore|cry) wk(\d+)(?: o(\d+))?$/.exec(item))) e.fields.push({ i: N(m[1]), res: m[2], wk: N(m[3]), o: m[4] != null ? N(m[4]) : null });
    else if ((m = /^idle wk (#\d+(?:,#\d+)*)$/.exec(item))) e.idleWk.push(...ids(m[1]));
    else bad('E', item);
  }
  return e;
}

// A line: `tr x5@39,1 i #22,#23 out`
const CLUSTER = /^([a-z]{2}) x(\d+)@(-?\d+),(-?\d+) (\S+)(?: (#\d+(?:,#\d+)*))?( out)?$/;
function armyLine(line) {
  const m = CLUSTER.exec(line) || bad('A', line);
  return { type: m[1], n: N(m[2]), x: N(m[3]), z: N(m[4]), state: m[5], ids: m[6] ? ids(m[6]) : [], out: !!m[7], label: `${m[1]} x${m[2]}@${m[3]},${m[4]}` };
}

// B compact: `co#1@70,4 hp97 post@53,32 yard@70,43 ba#13 bld20 dp#22 tu#30@50,-3 (no tu)`; full: one `co#1@70,4 hp100` per line
function buildingsText(text, b) {
  if (text === 'none') return;
  const toks = text.split(' ');
  let cur = null;
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i]; let m;
    if ((m = /^([a-z]{2})#(\d+)(?:@(-?\d+),(-?\d+))?$/.exec(k))) { cur = { type: m[1], id: N(m[2]), x: m[3] != null ? N(m[3]) : null, z: m[4] != null ? N(m[4]) : null, hp: 100, bld: null }; b.list.push(cur); }
    else if ((m = /^hp(\d+)$/.exec(k)) && cur) cur.hp = N(m[1]);
    else if ((m = /^bld ?(\d+)$/.exec(k)) && cur) cur.bld = N(m[1]);
    else if (k === 'bld' && /^\d+$/.test(toks[i + 1] || '') && cur) cur.bld = N(toks[++i]);
    else if ((m = /^post@(-?\d+),(-?\d+)$/.exec(k))) b.post = { x: N(m[1]), z: N(m[2]) };
    else if ((m = /^yard@(-?\d+),(-?\d+)$/.exec(k))) b.yard = { x: N(m[1]), z: N(m[2]) };
    else if (k === '(no' && toks[i + 1] === 'tu)') { b.noTu = true; i++; }
    else if (k === '(2nd' && toks[i + 1] === 'ba)') { b.secondBa = true; i++; }
    else bad('B', text);
  }
}

// X line: `tr x12@-39,-33 d106/8 dug #20043`
const ENEMY = /^([a-z]{2}) x(\d+)@(-?\d+),(-?\d+) d(\d+|-)\/(\d+|-)( dug)?(?: (#\d+(?:,#\d+)*))?$/;
function enemyLine(line) {
  const m = ENEMY.exec(line) || bad('X', line);
  return { type: m[1], n: N(m[2]), x: N(m[3]), z: N(m[4]), dB: m[5] === '-' ? null : N(m[5]), dA: m[6] === '-' ? null : N(m[6]), dug: !!m[7], ids: m[8] ? ids(m[8]) : [], label: `${m[1]} x${m[2]}@${m[3]},${m[4]}` };
}

// M line: `ba#12@22,49 hp80 age12` or `search f5@78,13` / `search @-60,-36`
function rememberedLine(line, mem) {
  let m;
  if ((m = /^([a-z]{2})#(\d+)@(-?\d+),(-?\d+) hp(\d+) age(\d+)$/.exec(line))) mem.buildings.push({ type: m[1], id: N(m[2]), x: N(m[3]), z: N(m[4]), hp: N(m[5]), age: N(m[6]) });
  else if ((m = /^search (?:f(\d+)c?)?@(-?\d+),(-?\d+)$/.exec(line))) mem.search = { field: m[1] != null ? N(m[1]) : null, x: N(m[2]), z: N(m[3]) };   // `f14c`: runs 53-56 could name a crystal field
  else bad('M', line);
}

// F line: `f1 home ore@61,13 o1285 live n#1,#2` / `f3 exp ore@-5,-34 ?` / `f? f6@-42,7 f11c@13,-17`
function fieldLine(line, f) {
  let m;
  if (line.startsWith('f? ')) {
    for (const tok of line.slice(3).split(' ')) { m = /^f(\d+)(c)?@(-?\d+),(-?\d+)$/.exec(tok) || bad('F', line); f.unexplored.push({ i: N(m[1]), crystal: !!m[2], x: N(m[3]), z: N(m[4]) }); }
    return;
  }
  m = /^f(\d+) (\S+) (ore|cry)@(-?\d+),(-?\d+) (\?|o\d+)( live)?(?: n(#\d+(?:,#\d+)*))?$/.exec(line) || bad('F', line);
  const fld = { i: N(m[1]), kind: m[2], res: m[3], x: N(m[4]), z: N(m[5]), o: m[6] === '?' ? null : N(m[6].slice(1)), live: !!m[7], nodes: m[8] ? ids(m[8]) : [] };
  if (fld.o === null) f.unexplored.push({ i: fld.i, crystal: fld.res === 'cry', x: fld.x, z: fld.z }); else f.fields.push(fld);
}

// L: `train tr #13 ok; build dp 70,-12 nospot; pending: seen tr@45,22`
export function last(text) {
  const l = { items: [], nospot: [], pending: null, raw: text };
  if (text === 'none') return l;
  for (const item of text.split('; ')) {
    if (item.startsWith('pending: ')) { l.pending = item.slice(9); continue; }
    if (item === 'none') continue;
    const toks = item.split(' '), result = toks.pop();
    const it = { what: toks.join(' '), cmd: toks[0], result };
    if (result === 'nospot' && toks[0] === 'build') it.type = toks[1], l.nospot.push(it);
    l.items.push(it);
  }
  return l;
}

// read(text) → {h, d, t, p, e, a, b, x, m, f, l, layers}; layers = the set of tags present on this packet.
export function read(text) {
  const out = { h: null, d: delta('none'), t: triggers('none'), p: [], e: economy('none'), a: [], b: { list: [], post: null, yard: null, noTu: false, secondBa: false }, x: [], m: { buildings: [], search: null }, f: { fields: [], unexplored: [] }, l: last('none'), layers: new Set() };
  let cur = null;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const m = /^([HDTPEABXMFL])(?: (.*))?$/.exec(line);
    if (m && LAYER[m[1]]) {
      cur = m[1]; out.layers.add(cur);
      const rest = m[2];
      if (rest === undefined) continue;   // a line layer: its lines follow
      switch (cur) {
        case 'H': out.h = header(rest); break;
        case 'D': out.d = delta(rest); break;
        case 'T': out.t = triggers(rest); break;
        case 'P': out.p = production(rest); break;
        case 'E': out.e = economy(rest); break;
        case 'B': buildingsText(rest, out.b); break;
        case 'L': out.l = last(rest); break;
        case 'A': case 'X': case 'M': case 'F': if (rest !== 'none') bad(cur, line); break;
      }
      continue;
    }
    switch (cur) {
      case 'A': out.a.push(armyLine(line)); break;
      case 'B': buildingsText(line, out.b); break;
      case 'X': out.x.push(enemyLine(line)); break;
      case 'M': rememberedLine(line, out.m); break;
      case 'F': fieldLine(line, out.f); break;
      default: bad(cur || '?', line);
    }
  }
  if (!out.h) bad('H', 'missing');
  return out;
}

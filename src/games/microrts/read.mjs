// Packet text → facts. The inverse of coder.mjs for everything a policy reads, so a scripted decider sees exactly what the
// model sees: the text, nothing from the state. Structured layers (H P E A B X) are strict: an unrecognised token throws
// ReadError, so a packet the script cannot read is a visible failure. Event layers (D T L) have open vocabularies and are
// classified by first word.
import { TAG } from './abbr.mjs';

export class ReadError extends Error { constructor(layer, line) { super(`read: ${layer}: ${line}`); this.layer = layer; this.line = line; } }
const bad = (layer, line) => { throw new ReadError(layer, line); };
const N = s => Number(s);
const ids = s => s.split(',').map(x => N(x.replace('#', '')));
const LAYER = Object.fromEntries(Object.entries(TAG).map(([k, v]) => [v, k]));

// H: `t1836 r38 u1/26`
function header(text) {
  const m = /^t(\d+) r(-?\d+) u(\d+)\/(\d+)$/.exec(text) || bad('H', text);
  return { t: N(m[1]), r: N(m[2]), u: N(m[3]), them: N(m[4]) };
}

// D: `+wk#31 -wk#24 E+li#48 ba#20 hp6 r+8`
export function delta(text) {
  const d = { items: [], lost: [], gained: [], enemyNew: [], hurt: [], r: 0 };
  if (text === 'none') return d;
  const toks = text.split(' ');
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i]; let m;
    if ((m = /^(E?)([+-])([a-z]{2})#(\d+)$/.exec(k))) {
      const kind = m[1] ? (m[2] === '+' ? 'enemyNew' : 'enemyGone') : m[2] === '+' ? 'gained' : 'lost';
      const it = { kind, type: m[3], id: N(m[4]) };
      d.items.push(it);
      if (kind === 'gained') d.gained.push(it); else if (kind === 'lost') d.lost.push(it); else if (kind === 'enemyNew') d.enemyNew.push(it);
    } else if ((m = /^(E?)([a-z]{2})#(\d+)$/.exec(k)) && /^hp\d+$/.test(toks[i + 1] || '')) {
      const it = { kind: m[1] ? 'enemyHurt' : 'hurt', type: m[2], id: N(m[3]), hp: N(toks[++i].slice(2)) };
      d.items.push(it); if (!m[1]) d.hurt.push(it);
    } else if ((m = /^r([+-]\d+)$/.exec(k))) { d.r = N(m[1]); d.items.push({ kind: 'res', n: d.r }); }
    else d.items.push({ kind: 'other', text: k });
  }
  return d;
}

// T: `; `-separated events classified by first word; `x3` = repeated
export function triggers(text) {
  const t = { items: [], lost: [], dmg: [], contact: [], idle: [], kill: false, none: text === 'none' };
  if (t.none) return t;
  for (const raw of text.split('; ')) {
    const toks = raw.replace(/ x\d+$/, '').split(' ');
    const it = { kind: toks[0], text: raw };
    let m;
    if (toks[0] === 'kill') t.kill = true;
    else if (toks[0] === 'lost' && (m = /^([a-z]{2})#(\d+)$/.exec(toks[1] || ''))) { it.type = m[1]; it.id = N(m[2]); t.lost.push(it); }
    else if (toks[0] === 'dmg' && (m = /^([a-z]{2})#(\d+)$/.exec(toks[1] || ''))) { it.type = m[1]; it.id = N(m[2]); it.hp = N((toks[2] || 'hp0').slice(2)); t.dmg.push(it); }
    else if (toks[0] === 'seen' && toks[1] === 'at') { it.cell = toks[2]; t.contact.push(it); }
    else if (toks[0] === 'idle' && /^#\d+$/.test(toks[1] || '')) { it.id = N(toks[1].slice(1)); t.idle.push(it); }
    t.items.push(it);
  }
  return t;
}

// P: `ba#20 wk 32; br#40 li 61; ba#20 IDLE`
const PROD = /^([a-z]{2})#(\d+) (?:IDLE|([a-z]{1,2}) (\d+))$/;
function production(text) {
  if (text === 'none') return [];
  return text.split('; ').map(item => {
    const m = PROD.exec(item) || bad('P', item);
    const what = m[3] || null;
    // `wk|li|hv|rg` after the id is a unit being produced; a one-letter code is the building's own action state.
    return { type: m[1], id: N(m[2]), make: what && what.length === 2 ? what : null, st: what, eta: m[4] != null ? N(m[4]) : null, idle: !what };
  });
}

// E line: `rs#16@0,0 o25 d4`
const NODE = /^([a-z]{2})#(\d+)@(\d+),(\d+) o(\d+)(?: d(\d+))?$/;
const nodeLine = line => { const m = NODE.exec(line) || bad('E', line); return { type: m[1], id: N(m[2]), x: N(m[3]), y: N(m[4]), o: N(m[5]), d: m[6] != null ? N(m[6]) : null }; };

// A line: `wk x2@1,1 h #22,#25`
const CLUSTER = /^([a-z]{2}) x(\d+)@(\d+),(\d+) (\S)(?: (#\d+(?:,#\d+)*))?$/;
function armyLine(line) {
  const m = CLUSTER.exec(line) || bad('A', line);
  return { type: m[1], n: N(m[2]), x: N(m[3]), y: N(m[4]), state: m[5], ids: m[6] ? ids(m[6]) : [], label: `${m[1]} x${m[2]}@${m[3]},${m[4]}` };
}

// B: one line, space-joined `ba#20@2,2 hp10 br#40@4,2 hp4`
function buildingsText(text, b) {
  if (text === 'none') return;
  const toks = text.split(' ');
  for (let i = 0; i < toks.length; i += 2) {
    const m = /^([a-z]{2})#(\d+)@(\d+),(\d+)$/.exec(toks[i] || '');
    const hp = /^hp(\d+)$/.exec(toks[i + 1] || '');
    if (!m || !hp) bad('B', text);
    b.push({ type: m[1], id: N(m[2]), x: N(m[3]), y: N(m[4]), hp: N(hp[1]) });
  }
}

// X line: `wk x3@11,11 d18/21 #24,#38`; d is `-` when I have no base / no mobile unit left
const ENEMY = /^([a-z]{2}) x(\d+)@(\d+),(\d+) d(\d+|-)\/(\d+|-)(?: (#\d+(?:,#\d+)*))?$/;
function enemyLine(line) {
  const m = ENEMY.exec(line) || bad('X', line);
  return { type: m[1], n: N(m[2]), x: N(m[3]), y: N(m[4]), dB: m[5] === '-' ? null : N(m[5]), dA: m[6] === '-' ? null : N(m[6]), ids: m[7] ? ids(m[7]) : [], label: `${m[1]} x${m[2]}@${m[3]},${m[4]}` };
}

// L: `t 20 wk ok; h #22 #16 busy; a #22 13,13 dropped:stale`
export function last(text) {
  const l = { items: [], raw: text };
  if (text === 'none') return l;
  for (const item of text.split('; ')) {
    if (item === 'none') continue;
    const toks = item.split(' '), result = toks.pop();
    l.items.push({ what: toks.join(' '), cmd: toks[0], result, ok: result === 'ok' });
  }
  return l;
}

// read(text) → {h, d, t, p, e, a, b, x, l, layers}; layers = the set of tags present on this packet.
export function read(text) {
  const out = { h: null, d: delta('none'), t: triggers('none'), p: [], e: [], a: [], b: [], x: [], l: last('none'), layers: new Set() };
  let cur = null;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const m = /^([HDTPEABXL])(?: (.*))?$/.exec(line);
    if (m && LAYER[m[1]]) {
      cur = m[1]; out.layers.add(cur);
      const rest = m[2];
      if (rest === undefined) continue;   // a line layer: its lines follow
      switch (cur) {
        case 'H': out.h = header(rest); break;
        case 'D': out.d = delta(rest); break;
        case 'T': out.t = triggers(rest); break;
        case 'P': out.p = production(rest); break;
        case 'B': buildingsText(rest, out.b); break;
        case 'L': out.l = last(rest); break;
        case 'E': case 'A': case 'X': if (rest !== 'none') bad(cur, line); break;
      }
      continue;
    }
    switch (cur) {
      case 'E': out.e.push(nodeLine(line)); break;
      case 'A': out.a.push(armyLine(line)); break;
      case 'X': out.x.push(enemyLine(line)); break;
      default: bad(cur || '?', line);
    }
  }
  if (!out.h) bad('H', 'missing');
  return out;
}

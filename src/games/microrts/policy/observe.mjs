// Harness-computed facts for the commander: `O <name>: ...` lines, numbers with a my/their subject, never a verdict.
// see() on every reflex packet, read() at each commander launch. Each classifier is switched on by name.
// events() → the transitions see() noticed since the last events() call, `<classifier>: <fact>`, each once per transition.
import { read as readPacket } from '../read.mjs';
import { measure } from './commander.mjs';

export const CLASSIFIERS = ['near', 'home', 'reach', 'trig', 'foe', 'fight', 'gone', 'econ', 'units', 'match', 'push'];
// Standard microRTS UnitTypeTable (basic mod); not carried by any packet, so hardcoded here.
const UTT = { li: { cost: 2, hp: 4, dmg: 2, pt: 80 }, hv: { cost: 3, hp: 8, dmg: 4, pt: 120 }, rg: { cost: 2, hp: 1, dmg: 1, pt: 100, rng: 3 } };
const TARGETS = [['wk', 1], ['li', 4], ['hv', 8], ['rg', 1]];
const MOBILE = ['wk', 'li', 'hv', 'rg'];
const COMBAT = new Set(['li', 'hv', 'rg']);
const BLD = new Set(['ba', 'br']);
const COST = { wk: 1, li: 2, hv: 3, rg: 2, br: 5, ba: 10 };
const IDLE_W = 100, EV_MAX = 50, BANK_HI = 10, HOME_MIN = 3;
const W = 100, FOE_W = 300, HIST_W = 300, NEAR_COMBAT = 12, SAME_R = 3;
const FIGHT_W = 30, FIGHT_R = 4, POS_FRESH = 20, FORGET = 500, MLOG_MAX = 2000;

const d1 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const sgn = v => (v > 0 ? `+${v}` : `${v}`);
const counts = o => Object.entries(o).map(([t, n]) => `${t} x${n}`).join(' ');
const subject = metric => (metric.startsWith('foe_') ? `their ${metric.slice(4)}` : `my ${metric}`);

// Deterministic UTT combat model: rounds simultaneous, rg-only for the first two (range), then all attack.
// first 'mine'|'theirs': that side's whole army swings in round 1 (checked on 142 recorded fights: 94% winner with the true striker, 73% without).
export function fight(mine, theirs, first = null) {
  const build = o => ['li', 'hv', 'rg'].flatMap(ty => Array.from({ length: o[ty] || 0 }, () => ({ ty, hp: UTT[ty].hp })));
  let a = build(mine), b = build(theirs);
  const order = { hv: 0, li: 1, rg: 2 };
  // One side's attackers (hv, li, rg order) each hit the lowest-hp not-yet-killed defender; ties by defender type.
  const hit = (attackers, defenders) => {
    const scratch = defenders.map(u => u.hp), alive = defenders.map((_, i) => i), dmg = defenders.map(() => 0);
    for (const u of [...attackers].sort((x, y) => order[x.ty] - order[y.ty])) {
      if (!alive.length) break;
      let best = alive[0];
      for (const i of alive) if (scratch[i] < scratch[best] || (scratch[i] === scratch[best] && order[defenders[i].ty] < order[defenders[best].ty])) best = i;
      scratch[best] -= UTT[u.ty].dmg; dmg[best] += UTT[u.ty].dmg;
      if (scratch[best] <= 0) alive.splice(alive.indexOf(best), 1);
    }
    return dmg;
  };
  for (let round = 1; round <= 200 && a.length && b.length; round++) {
    const rgOnly = (l, side) => (round <= 2 && !(round === 1 && first === side) ? l.filter(u => u.ty === 'rg') : l);
    const aAtk = rgOnly(a, 'mine'), bAtk = rgOnly(b, 'theirs');
    const dmgB = hit(aAtk, b), dmgA = hit(bAtk, a);
    a.forEach((u, i) => (u.hp -= dmgA[i])); b.forEach((u, i) => (u.hp -= dmgB[i]));
    a = a.filter(u => u.hp > 0); b = b.filter(u => u.hp > 0);
  }
  const survivors = list => { const o = {}; for (const ty of ['li', 'hv', 'rg']) { const n = list.filter(u => u.ty === ty).length; if (n) o[ty] = n; } return o; };
  return { mine: survivors(a), theirs: survivors(b) };
}

const outcome = r => {
  const my = counts(r.mine), th = counts(r.theirs);
  if (my && !th) return `I keep ${my}`;
  if (th && !my) return `they keep ${th}`;
  return 'none left';
};

// Current fight, then what n more of each type (n = floor(ore/cost)) would buy; both first-strike cases when they differ.
const both = (m, t) => {
  const a = outcome(fight(m, t, 'mine')), b = outcome(fight(m, t, 'theirs'));
  return a === b ? a : `I strike first: ${a} / they strike first: ${b}`;
};
// rate: ore mined per cycle over the last `span` cycles, null = unknown; below `ore` in the bank, rows wait on income.
export function matchLine(mine, theirs, { ore = 6, bank = ore, rate = null, span = 100 } = {}) {
  if (!Object.keys(theirs).length) return `my ${counts(mine) || 'none'} vs their none`;
  const segs = [`my ${counts(mine) || 'none'} vs their ${counts(theirs)}: ${both(mine, theirs)}`];
  const broke = rate !== null && rate <= 0 && bank < ore, slow = rate > 0 && bank < ore, have = broke ? bank : ore;
  for (const ty of ['li', 'hv', 'rg']) {
    const n = Math.floor(have / UTT[ty].cost);
    if (broke && !n) continue;
    const cycles = slow ? Math.max(n * UTT[ty].pt, Math.ceil((ore - bank) / rate) + UTT[ty].pt) : n * UTT[ty].pt;
    const add = Object.fromEntries(['li', 'hv', 'rg'].map(t => [t, (mine[t] || 0) + (t === ty ? n : 0)]).filter(([, v]) => v));
    segs.push(`+${have} ore ${ty} x${n} (${cycles}c${slow ? ` at ${sgn(Math.round(rate * span))}/${span}c` : ''}) = my ${counts(add)}: ${both(add, theirs)}`);
  }
  if (broke) segs.push('no income');
  return segs.join(' | ');
}

function nearest(x) {
  const mob = x.filter(c => MOBILE.includes(c.type) && c.dB != null);
  const combat = mob.filter(c => COMBAT.has(c.type) && c.dB <= NEAR_COMBAT);
  const pool = combat.length ? combat : mob;
  return pool.length ? pool.reduce((a, c) => (c.dB < a.dB ? c : a)) : null;
}

export function createObserver({ classifiers = [] } = {}) {
  if (typeof classifiers !== 'string' && !Array.isArray(classifiers)) throw new Error('classifiers: a string or an array');
  const list = (typeof classifiers === 'string' ? classifiers.split(',') : classifiers).map(s => String(s).trim()).filter(Boolean);
  for (const c of list) if (c !== 'all' && !CLASSIFIERS.includes(c)) throw new Error(`unknown classifier "${c}"`);
  const on = new Set(list.includes('all') ? CLASSIFIERS : list);

  const hist = [];                 // {t, bank, m, mob, foe, near, prod, built, push}
  const mlog = [];                 // {t, m}: reach's history, longer than hist
  const pos = new Map();           // id → {x, y, t}
  const dead = new Map();          // id → t
  const fights = [];               // {t0, t1, x, y, k, lost, killed}
  const bld = new Map();           // key → {label, type, x, y, goneT}
  const peak = {}, zeroT = {};
  const myBld = new Set();
  let firstBr = null, prevT = null;
  const evs = [], ev = { gone: [], seen: new Set(), idle: new Map(), out: null, inside: null, above: null, pushLight: null };
  const fire = (name, s) => { if (on.has(name)) { evs.push(`${name}: ${s}`); if (evs.length > EV_MAX) evs.shift(); } };

  const at = (arr, t) => { let h = arr[arr.length - 1]; for (let i = arr.length - 1; i >= 0 && arr[i].t >= t; i--) h = arr[i]; return h; };

  function death(t, type, id, mine) {
    if (dead.has(id)) return;
    dead.set(id, t);
    const q = pos.get(id);
    const p = q && (t - q.t <= POS_FRESH || (prevT !== null && q.t >= prevT)) ? q : null;
    let f = null;
    for (let i = fights.length - 1; i >= 0; i--) {
      const g = fights[i];
      if (t - g.t1 > FIGHT_W || (g.x == null) !== !p) continue;
      if (!p || cheb(p, g) <= FIGHT_R) { f = g; break; }
    }
    if (!f) {
      f = { t0: t, t1: t, x: p ? p.x : null, y: p ? p.y : null, k: 0, lost: {}, killed: {} };
      fights.push(f); if (fights.length > 2) fights.shift();
      fire('fight', `new fight t${t}${p ? ` @${p.x},${p.y}` : ''}: ${mine ? 'lost my' : 'killed their'} ${type}`);
    }
    f.t1 = t;
    if (p) { f.x = (f.x * f.k + p.x) / (f.k + 1); f.y = (f.y * f.k + p.y) / (f.k + 1); f.k++; }
    const side = mine ? f.lost : f.killed;
    side[type] = (side[type] || 0) + 1;
  }

  function seeX(k, t) {
    const present = new Set(), foe = {};
    for (const c of k.x) {
      foe[c.type] = (foe[c.type] || 0) + c.n;
      if (!BLD.has(c.type)) continue;
      if (c.type === 'br' && firstBr === null) firstBr = t;
      if (c.ids.length) for (const id of c.ids) { const key = `${c.type}#${id}`; present.add(key); bld.set(key, { label: key, type: c.type, x: c.x, y: c.y, goneT: null }); }
      else {
        const known = [...bld.entries()].filter(([, b]) => b.type === c.type && cheb(b, c) <= 1);
        if (known.length) for (const [key, b] of known) { present.add(key); b.goneT = null; }
        else { const key = `${c.type}@${c.x},${c.y}`; present.add(key); bld.set(key, { label: key, type: c.type, x: c.x, y: c.y, goneT: null }); }
      }
    }
    for (const [key, b] of bld) if (!present.has(key) && b.goneT === null) { b.goneT = t; ev.gone.push(`their ${b.label} gone t${t}`); }
    for (const ty of MOBILE) {
      const n = foe[ty] || 0;
      if (n > 0) { zeroT[ty] = null; peak[ty] = Math.max(peak[ty] || 0, n); }
      else if (peak[ty] > 0 && zeroT[ty] == null) { zeroT[ty] = t; if (peak[ty] >= 2) ev.gone.push(`their ${ty} 0 t${t} (peak ${peak[ty]})`); }
    }
    return foe;
  }

  // Transitions between the previous hist entry and the new one; the first packet only sets the baseline.
  function detect(now, prior, params) {
    const t = now.t, R = params?.defend ?? 6, first = !prior;
    for (const s of ev.gone.splice(0)) if (!first) fire('gone', s);
    for (const ty of [...MOBILE, 'br']) if (now.foe[ty] > 0 && !ev.seen.has(ty)) { ev.seen.add(ty); if (!first) fire('foe', `their ${ty} first seen t${t}`); }
    if (prior?.base && !now.base) fire('home', `my base lost t${t}`);
    const army = now.a.filter(c => COMBAT.has(c.type)), n = army.reduce((s, c) => s + c.n, 0);
    if (now.base && n >= HOME_MIN) {   // a lone sortie is the reflex's push, not an event
      const far = army.filter(c => d1(c, now.base) > R + 2), k = far.reduce((s, c) => s + c.n, 0);
      const allIn = army.every(c => d1(c, now.base) <= R);
      let out = ev.out;
      if (k > n / 2) out = true; else if (allIn) out = false;
      if (ev.out !== null && out !== ev.out) fire('home', out ? `my army ${n}: ${k} past d${R + 2} of my base t${t}` : `my army ${n}: all within d${R} of my base t${t}`);
      ev.out = out;
    }
    const cs = now.mob.filter(c => COMBAT.has(c.type) && c.dB != null), c = cs.length ? cs.reduce((a, o) => (o.dB < a.dB ? o : a)) : null;
    let inside = ev.inside;
    if (c && c.dB <= R) inside = true; else if (!c || c.dB > R + 2) inside = false;
    if (ev.inside !== null && inside !== ev.inside) fire('near', inside ? `their ${c.type} x${c.n} @${c.x},${c.y} d${c.dB} to my base, inside d${R} t${t}` : `their combat units none within d${R} of my base t${t}${c ? ` (nearest d${c.dB})` : ''}`);
    ev.inside = inside;
    const P = params?.pushLight;
    if (Number.isFinite(P)) {
      const above = now.m.army >= P;
      if (ev.above !== null && ev.pushLight === P && above !== ev.above) fire('trig', `my army ${now.m.army} ${above ? 'at or above' : 'below'} pushLight ${P} t${t}`);
      ev.above = above; ev.pushLight = P;
    }
    const idleKeys = [];
    for (const p of now.prod) {
      if (!p.idle || now.bank < 2) { ev.idle.delete(p.key); continue; }
      idleKeys.push(p.key);
      const s = ev.idle.get(p.key) ?? { t0: t, fired: false };
      ev.idle.set(p.key, s);
      if (!s.fired && t - s.t0 >= IDLE_W) { s.fired = true; fire('econ', `my ${p.key} idle ${t - s.t0}c, bank ${now.bank} t${t}`); }
    }
    for (const key of ev.idle.keys()) if (!now.prod.some(p => p.key === key)) ev.idle.delete(key);
    if (prior && prior.bank < BANK_HI && now.bank >= BANK_HI && idleKeys.length) fire('econ', `my bank ${now.bank} crossed ${BANK_HI}, ${idleKeys.join(', ')} idle t${t}`);
  }

  // Destination classes of this packet's attack-moves that carry a combat unit of mine; null when none.
  function orders(l, a, base, params) {
    const mine = new Set(a.filter(c => COMBAT.has(c.type)).flatMap(c => c.ids)), R = params?.defend ?? 6, out = new Set();
    const standing = [...bld.values()].filter(b => b.goneT === null);
    for (const it of l.items) {
      const mm = /^a (#\d+(?:,#\d+)*) (?:#(\d+)|(\d+),(\d+))$/.exec(it.what);
      if (!mm || !mm[1].split(',').some(s => mine.has(Number(s.slice(1))))) continue;
      if (mm[2]) { const b = standing.find(o => o.label === `${o.type}#${mm[2]}`); out.add(b ? `their ${b.type}` : 'their unit'); continue; }
      const p = { x: Number(mm[3]), y: Number(mm[4]) }, b = standing.find(o => cheb(o, p) <= 1);
      out.add(b ? `their ${b.type}` : base && d1(p, base) <= R ? 'my base' : 'between');
    }
    return out.size ? out : null;
  }

  function see(packet, params = null) {
    let k, m;
    try { k = typeof packet === 'string' ? readPacket(packet) : packet; m = measure(k); } catch { return; }
    const t = k.h.t, has = L => !k.layers || k.layers.has(L), hasX = has('X');
    for (const it of k.d.items) {
      if (it.kind === 'lost') death(t, it.type, it.id, true);
      else if (it.kind === 'enemyGone') death(t, it.type, it.id, false);
    }
    for (const it of k.t.items) {
      const mm = /^(lost|kill) ([a-z]{2})#(\d+)/.exec(it.text);
      if (mm) death(t, mm[2], Number(mm[3]), mm[1] === 'lost');
    }
    for (const c of [...k.a, ...k.x]) for (const id of c.ids) pos.set(id, { x: c.x, y: c.y, t });
    for (const [id, p] of pos) if (t - p.t > FORGET) pos.delete(id);
    for (const [id, dt] of dead) if (t - dt > FORGET) dead.delete(id);

    const prior = hist[hist.length - 1];
    const foe = hasX ? seeX(k, t) : prior?.foe ?? {};
    const base = has('B') ? k.b.find(c => c.type === 'ba') ?? null : prior?.base ?? null, a = has('A') ? k.a : prior?.a ?? [];
    const mob = hasX ? k.x.filter(c => MOBILE.includes(c.type)) : prior?.mob ?? [];
    hist.push({ t, bank: k.h.r, m, base, a, mob, foe, near: hasX ? nearest(k.x) : prior?.near ?? null, prod: has('P') ? k.p.map(p => ({ key: `${p.type}#${p.id}`, idle: p.idle, make: p.make, eta: p.eta })) : prior?.prod ?? [], built: k.b.filter(c => !myBld.has(c.id)).map(c => (myBld.add(c.id), c.type)), push: has('L') ? orders(k.l, a, base, params) : null });
    detect(hist[hist.length - 1], prior, params);
    while (hist.length > 1 && t - hist[1].t >= HIST_W) hist.shift();
    mlog.push({ t, m }); if (mlog.length > MLOG_MAX) mlog.shift();
    prevT = t;
  }

  // Ore mined and spent over the last ~W cycles, spending counted by production starts and new buildings.
  function flow() {
    const now = hist[hist.length - 1], then = at(hist, now.t - W), span = now.t - then.t, i0 = hist.indexOf(then), started = {};
    let spent = 0;
    for (let i = i0 + 1; i < hist.length; i++) {
      for (const q of hist[i - 1].prod) {
        const p = hist[i].prod.find(o => o.key === q.key);
        if (q.make && p && (p.make !== q.make || (p.eta ?? 0) > (q.eta ?? 0))) { spent += COST[q.make] ?? 0; started[q.make] = (started[q.make] || 0) + 1; }
      }
      for (const ty of hist[i].built) { spent += COST[ty] ?? 0; started[ty] = (started[ty] || 0) + 1; }
    }
    return { now, then, i0, span, spent, started, mined: now.bank - then.bank + spent };
  }

  const lines = {
    near() {
      const now = hist[hist.length - 1], c = now.near;
      if (!c) return 'their mobile none';
      let s = `their ${c.type} x${c.n} @${c.x},${c.y} d${c.dB} to my base`;
      const then = at(hist, now.t - W);
      if (then.t < now.t) {
        const same = then.mob.filter(o => o.type === c.type && o.dB != null && (o.ids.some(id => c.ids.includes(id)) || cheb(o, c) <= SAME_R));
        if (same.length) s += `, was d${same.reduce((a, o) => (cheb(o, c) < cheb(a, c) ? o : a)).dB} @t${then.t}`;
      }
      return s;
    },
    home(params) {
      const now = hist[hist.length - 1], R = params?.defend ?? 6;
      const army = now.a.filter(c => COMBAT.has(c.type)), wk = now.a.filter(c => c.type === 'wk');
      const sum = cs => cs.reduce((s, c) => s + c.n, 0);
      const ds = now.mob.filter(c => c.dB != null).map(c => c.dB);
      const foe = `their nearest mobile ${ds.length ? `d${Math.min(...ds)}` : 'none'}`;
      const n = sum(army);
      if (!now.base) return `my base gone; my army ${n}; my wk ${sum(wk)}; ${foe}`;
      const inR = cs => cs.filter(c => d1(c, now.base) <= R), out = army.filter(c => d1(c, now.base) > R);
      let s = `my army ${n}`;
      if (n) {
        s += `: ${sum(inR(army))} within d${R} of my base`;
        if (out.length) {
          const d = out.map(c => d1(c, now.base)), lo = Math.min(...d), hi = Math.max(...d);
          s += `, ${sum(out)} at d${lo}${hi > lo ? `-${hi}` : ''}`;
        }
      }
      return `${s}; my wk ${sum(inR(wk))} at base; ${foe}`;
    },
    reach(expect) {
      if (!expect) return null;
      const now = mlog[mlog.length - 1], v = now.m[expect.metric];
      if (typeof v !== 'number') return null;
      const then = at(mlog, expect.since ?? 0), dv = v - then.m[expect.metric], dt = now.t - then.t;
      const s = `${expect.metric}${expect.op}${expect.value} by t${expect.by}: ${subject(expect.metric)} ${v}`;
      if (!dv || dt <= 0) return `${s}, no change since t${then.t}`;
      const gap = expect.value - v;
      const rate = Math.abs(dv) > dt ? `${sgn(Math.round(dv / dt))}/c` : `${sgn(dv)}/${dt}c`;
      if (gap && Math.sign(gap) !== Math.sign(dv)) return `${s}, gap ${gap}, rate ${rate} since t${then.t}`;
      return Math.abs(dv) > dt ? `${s}, ${rate} since t${then.t}` : `${s}, ${sgn(dv)} in last ${dt}c since t${then.t}`;
    },
    trig(params) {
      if (!params) return null;
      const now = hist[hist.length - 1], then = at(hist, now.t - W), m = now.m;
      const d = m.army - then.m.army;
      const parts = [`pushLight ${params.pushLight}: my army ${m.army}${then.t < now.t ? ` (${sgn(d)} in last ${now.t - then.t}c)` : ''}`];
      parts.push(`barracksAt ${params.barracksAt}: my wk ${m.wk}, br ${m.br}`);
      if (!m.br) parts.push(`pushWorkers ${params.pushWorkers}: my fighters ${Math.max(0, m.wk - params.harvesters) + m.army}`);
      const dn = now.near ? Math.min(...now.mob.filter(c => c.dB != null).map(c => c.dB)) : null;   // the model compares d to a threshold badly; say which side
      parts.push(`defend ${params.defend}/panic ${params.panic}: their nearest mobile ${dn === null ? 'd-' : `d${dn}, ${dn <= params.panic ? 'inside panic' : dn <= params.defend ? 'inside defend' : 'outside defend'}`}`);
      return parts.join('; ');
    },
    foe() {
      const now = hist[hist.length - 1], then = at(hist, now.t - FOE_W), parts = [];
      if (firstBr !== null) parts.push(`their br ${now.foe.br || 0}${now.t <= 600 ? ` (first t${firstBr})` : ''}`);
      for (const ty of MOBILE) {
        if (!peak[ty]) continue;
        const n = now.foe[ty] || 0, d = n - (then.foe[ty] || 0);
        parts.push(`their ${ty} ${n} (peak ${peak[ty]}${d && then.t < now.t ? `, ${sgn(d)} since t${then.t}` : ''})`);
      }
      return parts.length ? parts.join('; ') : null;
    },
    fight() {
      if (!fights.length) return null;
      return [...fights].sort((a, b) => a.t0 - b.t0).map(f => {
        const what = [Object.keys(f.lost).length ? `lost my ${counts(f.lost)}` : null, Object.keys(f.killed).length ? `killed their ${counts(f.killed)}` : null].filter(Boolean).join(', ');
        const span = `t${f.t0}${f.t1 > f.t0 ? `-${f.t1}` : ''}`;
        return f.x != null ? `${span} @${Math.round(f.x)},${Math.round(f.y)}: ${what}` : `${span}: ${what} (place unknown)`;
      }).join('; ');
    },
    gone() {
      const parts = [...bld.values()].filter(b => b.goneT !== null).sort((a, b) => b.goneT - a.goneT).slice(0, 2).map(b => `their ${b.label} since t${b.goneT}`);
      for (const ty of MOBILE) if (zeroT[ty] != null && peak[ty] >= 2) parts.push(`their ${ty} 0 since t${zeroT[ty]} (peak ${peak[ty]})`);
      return parts.length ? parts.join('; ') : null;
    },
    econ() {
      const { now, i0, span, mined, spent, started } = flow();
      const committed = now.prod.reduce((c, p) => c + (p.make ? COST[p.make] ?? 0 : 0), 0);
      let s = `my bank ${now.bank}${committed ? ` (${committed} committed)` : ''}`;
      if (span <= 0) return s;
      const idle = {};
      for (let i = i0; i < hist.length - 1; i++) for (const p of hist[i].prod) if (p.idle) idle[p.key] = (idle[p.key] || 0) + hist[i + 1].t - hist[i].t;
      const st = Object.entries(started).map(([t, n]) => `${t} ${n}`).join(', ');
      s += `; mined ${sgn(mined)}/${span}c, spent ${spent}/${span}c${st ? ` (${st})` : ''}`;
      const prod = now.prod.map(p => `${p.key} idle ${idle[p.key] || 0}/${span}c`);
      if (!prod.length) return s;
      const top = [...now.prod].sort((x, y) => (idle[y.key] || 0) - (idle[x.key] || 0));
      const most = top.length > 1 && (idle[top[0].key] || 0) > (idle[top[1].key] || 0) ? `; most idle ${top[0].key}` : '';   // the model compares badly once it knows which is the barracks
      return `${s}; ${prod.join(', ')}${most}`;
    },
    units() {
      const m = hist[hist.length - 1].m, mine = {}, theirs = {};
      for (const ty of ['li', 'hv', 'rg']) { if (m[ty]) mine[ty] = m[ty]; if (m[`foe_${ty}`]) theirs[ty] = m[`foe_${ty}`]; }
      let labeled = false;
      const stat = ty => {
        const u = UTT[ty];
        const kills = TARGETS.map(([t, hp]) => {
          const n = Math.ceil(hp / u.dmg);
          if (labeled) return `${t} ${n}`;
          labeled = true; return `${t} ${n} swing`;
        }).join(', ');
        return `${ty} ${u.hp}hp ${u.dmg}dmg${u.rng ? ` range ${u.rng}` : ''} cost ${u.cost} ${u.pt}c: kills ${kills}`;
      };
      return [`my ${counts(mine) || 'none'} vs their ${counts(theirs) || 'none'}`, stat('li'), stat('hv'), stat('rg')].join(' | ');
    },
    match() {
      const m = hist[hist.length - 1].m, mine = {}, theirs = {};
      for (const ty of ['li', 'hv', 'rg']) { if (m[ty]) mine[ty] = m[ty]; if (m[`foe_${ty}`]) theirs[ty] = m[`foe_${ty}`]; }
      const { now, span, mined } = flow();
      return matchLine(mine, theirs, { bank: now.bank, rate: span > 0 ? mined / span : null, span });
    },
    push() {
      const now = hist[hist.length - 1], army = now.a.filter(c => COMBAT.has(c.type)), n = army.reduce((s, c) => s + c.n, 0);
      if (!n) return null;
      const standing = [...bld.values()].filter(b => b.goneT === null), dist = (cs, b) => Math.min(...cs.map(c => d1(c, b)));
      const tgt = standing.find(b => b.type === 'ba') ?? (standing.length ? standing.reduce((a, b) => (dist(army, b) < dist(army, a) ? b : a)) : null);
      if (!tgt) return null;
      const then = at(hist, now.t - W), was = then.t < now.t ? then.a.filter(c => COMBAT.has(c.type)) : [];
      const i0 = hist.indexOf(then), cnt = {};
      for (const h of hist.slice(i0 + (then.t < now.t ? 1 : 0))) for (const c of h.push ?? []) cnt[c] = (cnt[c] || 0) + 1;
      const ord = ['their ba', 'their br', 'their unit', 'between', 'my base'].filter(c => cnt[c]).map(c => `${cnt[c]} ${c === 'between' ? c : `at ${c}`}`);
      return `my army ${n} nearest d${dist(army, tgt)} to their ${tgt.type}@${tgt.x},${tgt.y}${was.length ? `, was d${dist(was, tgt)} @t${then.t}` : ''}; orders last ${now.t - then.t}c: ${ord.join(', ') || 'none'}`;
    },
  };

  return {
    see,
    events: () => evs.splice(0),
    read(params, { expect = null } = {}) {
      if (!on.size || !hist.length) return null;
      const out = [];
      for (const name of CLASSIFIERS) {
        if (!on.has(name)) continue;
        const v = name === 'reach' ? lines.reach(expect) : name === 'trig' || name === 'home' ? lines[name](params) : lines[name]();   // every call restates: the model is stateless
        if (v) out.push(`O ${name}: ${v}`);
      }
      return out.length ? out.join('\n') : null;
    },
  };
}

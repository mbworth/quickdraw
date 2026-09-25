// Harness-computed facts for the commander: `O <name>: ...` lines, numbers with a my/their subject, never a verdict.
// see() on every reflex packet, read() at each commander launch. Each classifier is switched on by name.
import { read as readPacket } from '../read.mjs';
import { measure } from './commander.mjs';

export const CLASSIFIERS = ['near', 'home', 'reach', 'trig', 'foe', 'fight', 'gone', 'econ'];
const MOBILE = ['wk', 'li', 'hv', 'rg'];
const COMBAT = new Set(['li', 'hv', 'rg']);
const BLD = new Set(['ba', 'br']);
const COST = { wk: 1, li: 2, hv: 3, rg: 2, br: 5, ba: 10 };
const W = 100, FOE_W = 300, HIST_W = 300, NEAR_COMBAT = 12, SAME_R = 3;
const FIGHT_W = 30, FIGHT_R = 4, POS_FRESH = 20, FORGET = 500, MLOG_MAX = 2000;

const d1 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const sgn = v => (v > 0 ? `+${v}` : `${v}`);
const counts = o => Object.entries(o).map(([t, n]) => `${t} x${n}`).join(' ');
const subject = metric => (metric.startsWith('foe_') ? `their ${metric.slice(4)}` : `my ${metric}`);

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

  const hist = [];                 // {t, bank, m, mob, foe, near, prod, built}
  const mlog = [];                 // {t, m}: reach's history, longer than hist
  const pos = new Map();           // id → {x, y, t}
  const dead = new Map();          // id → t
  const fights = [];               // {t0, t1, x, y, k, lost, killed}
  const bld = new Map();           // key → {label, type, x, y, goneT}
  const peak = {}, zeroT = {};
  const myBld = new Set();
  let firstBr = null, prevT = null;

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
    for (const [key, b] of bld) if (!present.has(key) && b.goneT === null) b.goneT = t;
    for (const ty of MOBILE) {
      const n = foe[ty] || 0;
      if (n > 0) { zeroT[ty] = null; peak[ty] = Math.max(peak[ty] || 0, n); }
      else if (peak[ty] > 0 && zeroT[ty] == null) zeroT[ty] = t;
    }
    return foe;
  }

  function see(packet) {
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
    const mob = hasX ? k.x.filter(c => MOBILE.includes(c.type)) : prior?.mob ?? [];
    hist.push({ t, bank: k.h.r, m, base: has('B') ? k.b.find(c => c.type === 'ba') ?? null : prior?.base ?? null, a: has('A') ? k.a : prior?.a ?? [], mob, foe, near: hasX ? nearest(k.x) : prior?.near ?? null, prod: has('P') ? k.p.map(p => ({ key: `${p.type}#${p.id}`, idle: p.idle, make: p.make, eta: p.eta })) : prior?.prod ?? [], built: k.b.filter(c => !myBld.has(c.id)).map(c => (myBld.add(c.id), c.type)) });
    while (hist.length > 1 && t - hist[1].t >= HIST_W) hist.shift();
    mlog.push({ t, m }); if (mlog.length > MLOG_MAX) mlog.shift();
    prevT = t;
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
      if (!now.base) return `my army ${n}: no base; my wk ${sum(wk)}; ${foe}`;
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
      parts.push(`defend ${params.defend}/panic ${params.panic}: their nearest mobile ${now.near ? `d${Math.min(...now.mob.filter(c => c.dB != null).map(c => c.dB))}` : 'd-'}`);
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
      const now = hist[hist.length - 1], then = at(hist, now.t - W), span = now.t - then.t;
      const committed = now.prod.reduce((c, p) => c + (p.make ? COST[p.make] ?? 0 : 0), 0);
      let s = `my bank ${now.bank}${committed ? ` (${committed} committed)` : ''}`;
      if (span <= 0) return s;
      const idle = {}, started = {};
      let spent = 0;
      const i0 = hist.indexOf(then);
      for (let i = i0; i < hist.length; i++) {
        if (i < hist.length - 1) for (const p of hist[i].prod) if (p.idle) idle[p.key] = (idle[p.key] || 0) + hist[i + 1].t - hist[i].t;
        if (i === i0) continue;
        for (const q of hist[i - 1].prod) {
          const p = hist[i].prod.find(o => o.key === q.key);
          if (q.make && p && (p.make !== q.make || (p.eta ?? 0) > (q.eta ?? 0))) { spent += COST[q.make] ?? 0; started[q.make] = (started[q.make] || 0) + 1; }
        }
        for (const ty of hist[i].built) { spent += COST[ty] ?? 0; started[ty] = (started[ty] || 0) + 1; }
      }
      const mined = now.bank - then.bank + spent;
      const st = Object.entries(started).map(([t, n]) => `${t} ${n}`).join(', ');
      s += `; mined ${sgn(mined)}/${span}c, spent ${spent}/${span}c${st ? ` (${st})` : ''}`;
      const prod = now.prod.map(p => `${p.key} idle ${idle[p.key] || 0}/${span}c`);
      return prod.length ? `${s}; ${prod.join(', ')}` : s;
    },
  };

  return {
    see,
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

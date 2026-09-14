// The game38 strategy (prompts/ashfall/game38-sonnet.md, Play section) as code, read off the packet text alone.
// One purchase (first Buy line that holds and that `H o` covers), one army order (first Army line that holds), the Keep
// lines that are due; `-` otherwise. No memory, no state, no arithmetic the prompt does not do itself.
// decide(text) → {o, why}: `o` in the order language, `why` the lines that fired (`buy4`, `army7`, `keep:ry`) plus any
// `finding:*` where the prompt could not be executed as written. Needs --ashfall-guide (post, yard, wk/tr on the packet).
import { read, ReadError } from '../read.mjs';

const PRICE = { dp: 75, ba: 120, tu: 110, wk: 50, tr: 60 };
const COMBAT = new Set(['tr', 'rd', 'wd', 'sg']);
const BLD = new Set(['co', 'ba', 'dp', 'tu', 'wl', 'ar', 'se']);
const P = p => `${p.x},${p.z}`;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const sum = xs => xs.reduce((n, c) => n + c.n, 0);

export function decide(text) {
  const k = read(text);
  const { h, t, d, p, e, a, b, x, m, f, l } = k;
  const why = [], orders = [];
  const finding = s => why.push(`finding:${s}`);
  const core = b.list.find(c => c.type === 'co');
  if (!core || core.x == null) throw new ReadError('B', 'no core position: the prompt\'s `home` has no source');
  if (!b.post || !b.yard) throw new ReadError('B', 'no post/yard: the prompt needs --ashfall-guide');
  const home = { x: core.x, z: core.z }, post = b.post, yard = b.yard;
  const tr = h.tr ?? sum(a.filter(c => c.type === 'tr'));
  const wk = h.wk ?? sum(a.filter(c => c.type === 'wk'));

  // target = the first of: an enemy building in X, a building in M, the search point in M (always this packet's coordinates)
  const xb = x.find(c => BLD.has(c.type)), mb = m.buildings[0];
  const target = xb ? { x: xb.x, z: xb.z } : mb ? { x: mb.x, z: mb.z } : m.search ? { x: m.search.x, z: m.search.z } : null;
  const barracks = p.filter(q => q.type === 'ba' && q.done);
  const rallyOut = barracks.some(q => q.out);
  const spot = type => (l.nospot.some(it => it.type === type) ? post : yard);   // Keep: `L nospot` → the same build again at the post

  // ---- Buy ---- the first line whose condition holds *and* whose price `H o` covers now; an unaffordable line is skipped, not waited on
  let buy = null, spent = 0;
  const has = type => b.list.some(c => c.type === type);
  const bld = type => b.list.some(c => c.type === type && c.bld !== null);
  const units = !h.capped;   // "When H says CAPPED ... do not queue units until it is up"
  const shortest = () => barracks.reduce((s, q) => (q.q < s.q ? q : s));
  const lines = [
    [1, (h.capped || t.supCap || h.sCap - h.sUsed <= 2) && !bld('dp'), () => `b dp ${P(spot('dp'))}`, PRICE.dp],
    [2, !has('ba'), () => `b ba ${P(spot('ba'))}`, PRICE.ba],
    [3, units && wk < 6, () => `t ${core.id} wk 1`, PRICE.wk],
    [4, units && barracks.some(q => q.q < 3), () => `t ${barracks.find(q => q.q < 3).id} tr 2`, PRICE.tr],
    [5, h.o >= 200 && barracks.length > 0 && barracks.every(q => q.q >= 3) && b.list.filter(c => c.type === 'ba').length < 2, () => `b ba ${P(spot('ba'))}`, PRICE.ba],
    [6, units && wk < 12 && h.o >= 110, () => `t ${core.id} wk 1`, PRICE.wk],
    [7, units && h.o >= 200 && barracks.length > 0, () => `t ${shortest().id} tr 2`, PRICE.tr],
  ];
  const held = lines.filter(([, cond]) => cond);
  const first = has('ba') ? held.find(([, , , price]) => h.o >= price) : held.find(([n]) => n <= 2 && h.o >= (n === 1 ? PRICE.dp : PRICE.ba));   // Buy 2: until the barracks is placed, buy nothing else
  if (first) { buy = first[2](); spent = first[3]; why.push(`buy${first[0]}`); } else if (held.length) why.push(`buy${held[0][0]}:noore`);
  if (buy) orders.push(buy);

  // ---- Army ----
  const mine = a.filter(c => c.type === 'tr');
  const fighting = c => c.state === 'a';   // Army 2: riflemen in state `a` get no order
  const labels = cs => cs.map(c => c.label).join(',');
  const every = o => barracks.map(q => `ry ${q.id} ${P(o)}`);
  const enemyCo = x.find(c => c.type === 'co');
  const dug = x.find(c => c.dug && c.dA != null && c.dA < 15 && c.n >= sum(mine.filter(q => dist(q, c) <= 15)));
  const raid = x.filter(c => COMBAT.has(c.type) && c.dB != null && c.dB < 25);
  if (dug && !enemyCo) {   // Army 1: their army is home and entrenched; the attack is off
    const there = mine.filter(q => !fighting(q) && dist(q, dug) <= 15);
    if (there.length) orders.push(`am ${labels(there)} ${P(post)}`);
    orders.push(...every(post)); why.push('army1');
  } else if (enemyCo) { orders.push(enemyCo.ids.length ? `a troopers ${enemyCo.ids[0]}` : `am troopers ${P(enemyCo)}`); why.push('army3'); if (!enemyCo.ids.length) finding('army3:no-id'); }
  else if (rallyOut) {   // Army 4: the attack is on
    if (tr < 5) { orders.push(...every(post), `am troopers ${P(post)}`); why.push('army4:failed'); }
    else {
      const idle = mine.filter(q => q.state === 'i');
      const to = target || barracks.find(q => q.out).rally;
      if (!target) finding('army4:no-target');
      if (idle.length) orders.push(`am ${labels(idle)} ${P(to)}`);
      why.push('army4');
    }
  } else if (mine.some(q => q.out && !fighting(q))) { orders.push(`am ${labels(mine.filter(q => q.out && !fighting(q)))} ${P(post)}`); why.push('army5'); }
  else if (raid.length) {   // Army 6: a raid at home; outnumbered or too far → hold beside the turret
    const homeTr = mine.filter(q => !q.out), n = sum(homeTr), en = sum(raid);
    const at = raid.reduce((s, c) => (c.dB < s.dB ? c : s));
    if (n > en && dist(at, home) <= 25 && homeTr.some(q => !fighting(q))) orders.push(`am ${labels(homeTr.filter(q => !fighting(q)))} ${P(at)}`);
    why.push('army6');
  } else if ((t.kill || d.enemyGone) && !x.some(c => COMBAT.has(c.type)) && tr >= 15) {   // Army 7: their wave just died at my post
    if (target) { orders.push(`am troopers ${P(target)}`, ...every(target)); why.push('army7'); } else { finding('army7:no-target'); why.push('army8'); }
  } else why.push('army8');

  // ---- Keep ----
  for (const q of barracks.filter(q => !q.rally)) { orders.push(`ry ${q.id} ${P(rallyOut && target ? target : post)}`); why.push('keep:ry'); }
  if (!has('tu') && tr >= 6 && h.o - spent >= PRICE.tu) { orders.push(`b tu ${P(post)}`); why.push('keep:tu'); }   // the turret is the agent's call: the script's one choice
  const hurt = b.list.find(c => c.type === 'tu' && c.bld === null && c.hp < 60);
  if (hurt) { orders.push(`r idle ${hurt.id}`); why.push('keep:repair'); }
  const dry = e.fields.some(fl => fl.o === 0);
  if (t.idleWk.length || e.idleWk.length || dry) {
    const near = fl => x.some(c => dist(c, fl) <= 20);
    const best = f.fields.filter(fl => fl.res === 'ore' && fl.o > 0 && fl.nodes.length && !near(fl)).sort((p1, p2) => p2.o - p1.o)[0];
    orders.push(best ? `g idle ${best.nodes[0]}` : 'g idle'); why.push(best ? 'keep:gather' : 'keep:gather:noF');
    if (!best && !k.layers.has('F')) finding('gather:no-F');
  }
  return { o: orders.length ? orders.join('; ') : '-', why };
}

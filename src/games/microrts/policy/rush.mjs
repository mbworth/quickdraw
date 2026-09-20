// The MicroRTS plan (prompts/microrts/game01-sonnet.md, Play section) as code, read off the packet text alone.
// Tuned for basesWorkers16x16 against ai.abstraction.WorkerRush: defence wins worker fights, because the defender
// reinforces from the base while the attacker arrives one unit at a time across twenty cells.
//
//   1. Two harvesters on the two nodes nearest my base; the moment one dies or idles, the next worker replaces it.
//   2. The base makes a worker whenever it is IDLE and the bank covers one, up to WK_CAP.
//   3. At BR_AT workers with the bank at BR_COST and no barracks, the free worker nearest my base builds one, early:
//      a Light kills a worker a hit and takes four to die, so the barracks is the whole game and every cycle it is late costs
//      (a Worker produces Barracks: the producer need not be a building).
//   4. A finished barracks makes Light whenever it is IDLE and the bank covers one. One Light kills a worker a hit
//      and takes four to die; it is worth two workers and change.
//   5. Defence first: an enemy cluster within DEFEND of my base draws every fighter, and within PANIC the harvesters too.
//      Outside panic, below ENGAGE free army units hold the post instead of sortieing solo (workers-only defence unchanged).
//   6. Attack when PUSH_LI Light are out, or PUSH_WK fighters with no barracks coming: the core (the largest cluster
//      of soldiers within GROUP of each other) attacks, any straggler rejoins the core instead of recalling the
//      whole front; below strength, everyone gathers at their own centroid first.
//   7. Otherwise fighters attack-move to the post, two steps from my base toward theirs, so the fight happens at home.
//
// decide(text, params) → {o, why}: `o` in the order language, `why` the lines that fired. No memory, no state, no map
// size — the enemy base comes from X, and every id from A. decideFacts(k, params) is the body, so the same policy
// runs on facts built straight from the state (facts.mjs); that pair is the fidelity oracle (bin/oracle.mjs). `params`
// is the commander split's parameter set (policy/commander.mjs): DEFAULTS reproduces this file's old constants exactly.
import { read } from '../read.mjs';

const WK_COST = 1, BR_COST = 5;
const COST = { li: 2, hv: 3, rg: 2 };
export const DEFAULTS = { harvesters: 2, workers: 6, barracksAt: 3, defend: 6, panic: 2, pushLight: 3, pushWorkers: 6, post: 1, target: null, train: 'li', group: 2, engage: 2 };
const MOBILE = new Set(['wk', 'li', 'hv', 'rg']);
const d1 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const step = (from, to, n) => { const dx = to.x - from.x, dy = to.y - from.y, L = Math.abs(dx) + Math.abs(dy) || 1; return { x: Math.round(from.x + (n * dx) / L), y: Math.round(from.y + (n * dy) / L) }; };
const P = p => `${p.x},${p.y}`;
const list = us => us.map(u => `#${u.id}`).join(',');

export const decide = (text, params = DEFAULTS) => decideFacts(read(text), params);

export function decideFacts(k, params = DEFAULTS) {
  const { harvesters: HARV, workers: WK_CAP, barracksAt: BR_AT, defend: DEFEND, panic: PANIC, pushLight: PUSH_LI, pushWorkers: PUSH_WK, post: POST, target: TARGET, train: TRAIN, group: GROUP, engage: ENGAGE } = params;
  const { h, p, e, a, b, x } = k;
  const why = [], orders = [];
  const base = b.find(c => c.type === 'ba') || null;
  const barracks = b.find(c => c.type === 'br') || null;
  const idle = id => p.find(q => q.id === id)?.idle ?? false;

  // Every mobile unit of mine, flattened out of A: ids are what an order can name, clusters are only how they are printed.
  const units = a.filter(c => MOBILE.has(c.type)).flatMap(c => c.ids.map(id => ({ id, type: c.type, x: c.x, y: c.y, state: c.state })));
  const anchor = base || units[0] || { x: 0, y: 0 };
  const near = (u, v) => d1(u, anchor) - d1(v, anchor) || u.id - v.id;
  const workers = units.filter(u => u.type === 'wk').sort(near);
  const army = units.filter(u => u.type !== 'wk').sort(near);
  if (!units.length) return { o: '-', why: ['dead'] };

  const theirBase = x.find(c => c.type === 'ba');
  const theirBuilding = x.filter(c => !MOBILE.has(c.type) && c.type !== 'ba').sort((c1, c2) => (c1.dB ?? 1e9) - (c2.dB ?? 1e9))[0];
  const enemyBuilding = theirBase || theirBuilding;
  const far = [...e].sort((n1, n2) => (n2.d ?? 0) - (n1.d ?? 0))[0];
  const target = TARGET || (theirBase ? { x: theirBase.x, y: theirBase.y } : theirBuilding ? { x: theirBuilding.x, y: theirBuilding.y } : far ? { x: far.x, y: far.y } : null);
  const post = target ? step(anchor, target, POST) : anchor;

  // Their base is on the packet (no fog on this map); the far nodes are where it stood if it has already fallen.
  // 5-7. The army order is decided first, because it says which workers are not available to mine.
  const raid = x.filter(c => MOBILE.has(c.type) && c.dB != null && c.dB <= DEFEND).sort((c1, c2) => c1.dB - c2.dB)[0];
  const panic = !!raid && raid.dB <= PANIC;                 // at the door: the harvesters drop their ore and fight too
  const nodes = e.filter(n => n.o > 0).sort((n1, n2) => (n1.d ?? 0) - (n2.d ?? 0) || n1.id - n2.id);

  // 1. two harvesters, chosen by what they are already doing: a worker in state h or r keeps its standing order and only
  //    the shortfall is topped up. Picking "the two nearest my base" every decision reassigned the pair every time one
  //    walked out to a node, so both dropped their ore and neither ever finished a trip (game 1: the bank stuck at 5).
  const mining = panic || !nodes.length ? [] : workers.filter(u => u.state === 'h' || u.state === 'r');
  const spare = workers.filter(u => !mining.includes(u) && u.state !== 'p');
  const topUp = panic || !nodes.length ? [] : spare.slice(0, Math.max(0, HARV - mining.length));
  topUp.forEach((u, i) => orders.push(`h #${u.id} ${nodes[Math.min(mining.length + i, nodes.length - 1)].id}`));
  const harvesters = [...mining, ...topUp];
  if (harvesters.length) why.push(`harv${harvesters.length}`);

  // 2-4. the purchase ladder, the bank threaded through it in plan order: tech, then army, then more workers. Counts are
  //    what keeps a producer busy between decisions: `t 20 wk 5` stands in the buffer and starts the next worker the cycle
  //    the last one pops, instead of idling until the next packet (game 2: 70 cycles a worker against their 50).
  const fighters = [...spare.slice(topUp.length), ...army];
  let bank = h.r;
  const builder = units.find(u => u.state === 'p' && u.type === 'wk') || fighters.find(u => u.type === 'wk' && u.state === 'i') || fighters.find(u => u.type === 'wk') || null;
  const building = units.some(u => u.state === 'p');
  if (!barracks && builder && workers.length >= BR_AT && bank >= BR_COST && !building) { orders.push(`t #${builder.id} br 1`); bank -= BR_COST; why.push('buy:br'); }
  // A mix (`train: 'li,hv'`) cycles by what already exists plus the unit in production, one at a time; a single type keeps a count of 5 standing.
  const types = (TRAIN || 'li').split(',').map(s => s.trim()).filter(t => COST[t]);
  if (barracks) {
    const producing = p.find(q => q.id === barracks.id)?.idle === false ? 1 : 0;
    const type = types.length > 1 ? types[(army.length + producing) % types.length] : types[0] || 'li', cost = COST[type];
    if (bank >= cost) { orders.push(`t ${barracks.id} ${type} ${types.length > 1 ? 1 : 5}`); bank -= cost; why.push(`buy:${type}`); }
  }
  if (base && bank >= WK_COST && workers.length < WK_CAP) { orders.push(`t ${base.id} wk ${Math.min(5, WK_CAP - workers.length)}`); bank -= WK_COST; why.push('buy:wk'); }
  if (!why.some(w => w.startsWith('buy'))) why.push('buy:none');

  const free = us => us.filter(u => u.state !== 'p' && u.id !== builder?.id);
  const enemyMobile = x.filter(c => MOBILE.has(c.type));
  const noEnemyMobile = !enemyMobile.length;
  // Mop-up: no building left to raze, but a unit is still hiding somewhere. Hunt it by id so the army stops
  // attack-moving to a dead cell forever.
  const huntCluster = enemyMobile.length ? [...enemyMobile].sort((c1, c2) => (c1.dB ?? 1e9) - (c2.dB ?? 1e9))[0] : null;
  const huntTarget = huntCluster && (huntCluster.ids.length ? { x: huntCluster.x, y: huntCluster.y, id: huntCluster.ids[0] } : { x: huntCluster.x, y: huntCluster.y });
  const centroid = us => ({ x: Math.round(us.reduce((s, u) => s + u.x, 0) / us.length), y: Math.round(us.reduce((s, u) => s + u.y, 0) / us.length) });
  // Push cohesion: a lone soldier out front must not become the core with everyone else stragglers. Core = the
  // largest cluster (any soldier as anchor, all within GROUP of it), ties broken by anchor nearest dest. A straggler
  // rejoins the core instead of the core waiting on it. Below strength (core short of PUSH_LI), everyone gathers at their own centroid first.
  const pushOrder = (who, dest, tag) => {
    const dp = dest.id != null ? `${dest.id}` : P(dest);
    const soldiers = who.filter(u => u.type !== 'wk');
    if (soldiers.length < 2) {
      if (who.length) orders.push(`a ${list(who)} ${dp}`);
      why.push(tag);
      return;
    }
    const groups = soldiers.map(anchor => ({ anchor, set: soldiers.filter(u => d1(u, anchor) <= GROUP) }));
    groups.sort((g1, g2) => g2.set.length - g1.set.length || d1(g1.anchor, dest) - d1(g2.anchor, dest));
    const core = groups[0].set;
    const need = Math.min(PUSH_LI, soldiers.length);
    if (core.length >= need) {
      const wk = who.filter(u => u.type === 'wk');
      orders.push(`a ${list([...core, ...wk])} ${dp}`);
      why.push(tag);
      const stragglers = soldiers.filter(u => !core.includes(u));
      if (stragglers.length) {
        orders.push(`a ${list(stragglers)} ${P(centroid(core))}`);
        why.push('push:join');
      }
    } else {
      if (who.length) orders.push(`a ${list(who)} ${P(centroid(soldiers))}`);
      why.push('push:gather');
    }
  };
  if (raid) {
    const freeFighters = free(fighters);
    const freeArmy = freeFighters.filter(u => u.type !== 'wk');
    if (panic) {
      const who = free([...fighters, ...harvesters]);
      if (who.length) orders.push(`a ${list(who)} ${P(raid)}`);
      why.push('defend:panic');
    } else if (freeArmy.length > 0 && freeArmy.length < ENGAGE) {
      // Below strength: hold the post rather than sortie into a fight that loses the army one at a time.
      if (freeFighters.length) orders.push(`a ${list(freeFighters)} ${P(post)}`);
      why.push('defend:hold');
    } else {
      if (freeFighters.length) orders.push(`a ${list(freeFighters)} ${P(raid)}`);
      why.push('defend');
    }
  } else if (noEnemyMobile && enemyBuilding && target) {
    pushOrder(free(fighters), target, 'push:last');
  } else if (!enemyBuilding && huntTarget) {
    pushOrder(free(fighters), huntTarget, 'push:hunt');
  } else if (target && (army.length >= PUSH_LI || (!barracks && fighters.length >= PUSH_WK))) {
    pushOrder(free(fighters), target, 'push');
  } else {
    const who = free(fighters);
    if (who.length) orders.push(`a ${list(who)} ${P(post)}`);
    why.push('post');
  }
  return { o: orders.length ? orders.join('; ') : '-', why };
}

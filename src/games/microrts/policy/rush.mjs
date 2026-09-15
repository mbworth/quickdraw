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
//   6. Attack when PUSH_LI Light are out, or PUSH_WK fighters with no barracks coming: everything but the harvesters
//      attack-moves at their base.
//   7. Otherwise fighters attack-move to the post, two steps from my base toward theirs, so the fight happens at home.
//
// decide(text) → {o, why}: `o` in the order language, `why` the lines that fired. No memory, no state, no map size —
// the enemy base comes from X, and every id from A. decideFacts(k) is the body, so the same policy runs on facts built
// straight from the state (facts.mjs); that pair is the fidelity oracle (bin/oracle.mjs).
import { read } from '../read.mjs';

const WK_COST = 1, BR_COST = 5, LI_COST = 2;
const HARV = 2, WK_CAP = 6, BR_AT = 3, DEFEND = 6, PANIC = 2, PUSH_LI = 3, PUSH_WK = 6, POST = 1;
const MOBILE = new Set(['wk', 'li', 'hv', 'rg']);
const d1 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const step = (from, to, n) => { const dx = to.x - from.x, dy = to.y - from.y, L = Math.abs(dx) + Math.abs(dy) || 1; return { x: Math.round(from.x + (n * dx) / L), y: Math.round(from.y + (n * dy) / L) }; };
const P = p => `${p.x},${p.y}`;
const list = us => us.map(u => `#${u.id}`).join(',');

export const decide = text => decideFacts(read(text));

export function decideFacts(k) {
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
  const far = [...e].sort((n1, n2) => (n2.d ?? 0) - (n1.d ?? 0))[0];
  const target = theirBase ? { x: theirBase.x, y: theirBase.y } : far ? { x: far.x, y: far.y } : null;
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
  if (barracks && bank >= LI_COST) { orders.push(`t ${barracks.id} li 5`); bank -= LI_COST; why.push('buy:li'); }
  if (base && bank >= WK_COST && workers.length < WK_CAP) { orders.push(`t ${base.id} wk ${Math.min(5, WK_CAP - workers.length)}`); bank -= WK_COST; why.push('buy:wk'); }
  if (!why.some(w => w.startsWith('buy'))) why.push('buy:none');

  const free = us => us.filter(u => u.state !== 'p' && u.id !== builder?.id);
  if (raid) {
    const who = free(panic ? [...fighters, ...harvesters] : fighters);
    if (who.length) orders.push(`a ${list(who)} ${P(raid)}`);
    why.push(panic ? 'defend:panic' : 'defend');
  } else if (target && (army.length >= PUSH_LI || (!barracks && fighters.length >= PUSH_WK))) {
    const who = free(fighters);
    if (who.length) orders.push(`a ${list(who)} ${P(target)}`);
    why.push('push');
  } else {
    const who = free(fighters);
    if (who.length) orders.push(`a ${list(who)} ${P(post)}`);
    why.push('post');
  }
  return { o: orders.length ? orders.join('; ') : '-', why };
}

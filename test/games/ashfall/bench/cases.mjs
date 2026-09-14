// Bench cases: a fixture state and what the frozen prompt (prompts/ashfall/game15-sonnet.md) says the order is at that moment.
// `expect(sent, state)` sees the orders after expand + validate (units are ids or selectors). Fixtures under ../fixtures (opening
// capture) and ./fixtures (scrubbed from live runs with bin/snapshot.mjs). Add a case when a rule breaks; never tune one to pass.
import { searchField } from '../../../../src/games/ashfall/coder.mjs';
const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const troopers = s => s.mine.filter(e => e.type === 'trooper');
const count = (c, s) => (c.units || []).reduce((n, v) => n + (typeof v === 'number' ? 1 : v === 'army' || v === 'all' || v === 'troopers' ? troopers(s).length : v === 'idle' ? troopers(s).filter(e => e.state === 'idle').length : 0), 0);
const mirror = s => ({ x: -s.myBase.x, z: -s.myBase.z });
const towardEnemy = (c, s) => D(c, mirror(s)) < D(c, s.myBase);
const goals = s => [mirror(s), searchField(s).f, searchField(s, { guide: true }).f];   // game25: the mirror; game32: the field waypoint; game38: mirror first
const atGoal = (c, s) => goals(s).some(g => D(c, g) <= 15);
const atSearch = (c, s) => [searchField(s).f, searchField(s, { guide: true }).f].some(g => D(c, g) <= 15);
const hold = (sent, s) => !has(sent, c => (c.cmd === 'move' || c.cmd === 'attack') && count(c, s) > 0 && (c.cmd === 'attack' || D(c, s.myBase) > 20));
const has = (sent, f) => sent.some(f);

export const cases = [
  // game38: the barracks before any harvester (game 25: `t wk 2` first, barracks at 97 s; game 31: never a rifleman)
  { id: 'opening', fixture: '../fixtures/001-t0.json', rule: 'Buy 2: no barracks → barracks, before any harvester',
    expect: sent => has(sent, c => c.cmd === 'build' && c.type === 'barracks') },
  // game38 Buy 4 puts the turret (ore 135, no turret) ahead of riflemen; the old prompt trained. Both are the plan's answer at t46.
  // s8/10 with two riflemen queued: Buy 1's depot (supply within 2 of cap) is the ladder's first match; riflemen and a turret are the plan too
  { id: 'train', fixture: '../fixtures/010-t46.json', rule: 'Buy 1/4: depot when supply is within 2 of cap; riflemen while the queue is under 3; a turret is the agent\'s call',
    expect: sent => has(sent, c => (c.cmd === 'train' && c.type === 'trooper') || (c.cmd === 'build' && (c.type === 'turret' || c.type === 'depot'))) },
  { id: 'capped', fixture: '../fixtures/013-t62.json', rule: '1: supply capped → depot',
    expect: sent => has(sent, c => c.cmd === 'build' && c.type === 'depot') },
  // game38 (after game 38 live): the turret is the agent's call; at t169 with 470 ore and the barracks at q3 the plan buys the second barracks
  { id: 'turret', fixture: '../fixtures/034-t169.json', rule: 'Buy 5: ore ≥ 200, every barracks q3+ → second barracks (a turret at the post is also the plan)',
    expect: sent => has(sent, c => c.cmd === 'build' && (c.type === 'turret' || c.type === 'barracks' || c.type === 'depot')) },   // s17/18: Buy 1's `sup cap` depot is the ladder's first match
  // game38: 8 idle riflemen, turret up, nothing visible → hold (every 8-rifleman sally in games 27-37 died or came home; the wins committed with 11-31).
  // The old prompt pushed here; `pushOld` keeps that predicate for scoring the game25/game32 arms.
  // Ore 80 with the queue at 2 buys nothing under game38, so `-` is the plan's answer here: the case scores the hold only.
  { id: 'push', fixture: './fixtures/push-t143.json', rule: 'Army 6/7: under 15 riflemen never leave the post',
    expect: (sent, s) => hold(sent, s) },
  { id: 'repair', fixture: './fixtures/repair-t267.json', rule: '6: turret under 60% → repair',
    expect: (sent, s) => { const t = new Set(s.mine.filter(e => e.type === 'turret').map(e => e.id)); return has(sent, c => c.cmd === 'repair' && t.has(c.target)); } },
  { id: 'dry', fixture: './fixtures/dry-t522.json', rule: '4: home fields dry, harvesters idle → gather at an explored node',
    expect: (sent, s) => { const nodes = new Set(s.fields.flatMap(f => (f.ore > 0 ? f.nodes.map(n => n.id) : []))); return has(sent, c => c.cmd === 'gather' && nodes.has(c.ore)); } },
  { id: 'core', fixture: './fixtures/core-t422.json', rule: '3/5: at the enemy base, attack what is visible (harvesters and barracks first, then the core)',
    expect: (sent, s) => { const core = s.enemyVisible.find(e => e.type === 'core'), vis = new Set(s.enemyVisible.map(e => e.id)); return !!core && has(sent, c => (c.cmd === 'attack' && vis.has(c.target)) || (c.cmd === 'move' && c.attackMove && D(c, core) <= 12)); } },
  // game 25: the ball went to the prompt's example coordinates 14 times with the barracks at 22,49 remembered; the M line was budget-dropped
  // 7 idle riflemen sit at 64,24, 130 from home, with 2 at the post and the rally at the post: game38 brings them back (Army 6); 9 is not an attack.
  { id: 'remembered', fixture: './fixtures/remembered-t213.json', rule: 'Army 6: a cluster out while the rally is not → attack-move it to the post',
    expect: (sent, s) => has(sent, c => c.cmd === 'move' && count(c, s) >= 6 && D(c, s.myBase) <= 20) },
  // game 25: no barracks until 97 s; `t wk 2` before `b ba` starved the build every decision (validate threads ore, so the build must survive it)
  { id: 'nobarracks', fixture: './fixtures/nobarracks-t60.json', rule: '1: no barracks → barracks, and it must be affordable after the rest of the batch',
    expect: sent => has(sent, c => c.cmd === 'build' && c.type === 'barracks') },
  // game 33 (hub 51): the ball (19, idle) stood at 0,-1 with M and X empty and was re-sent `am 0,0` 43 times; F listed eight unexplored fields.
  // The ball goes at the waypoint M names (the unexplored ore field nearest the mirror of my core), never back to 0,0 or home.
  // The rally is out (at the centre), so under game38 the attack is on (Army 3) and the target is the search point: the mirror under --ashfall-guide, the field without.
  { id: 'search', fixture: './fixtures/search-t345.json', rule: 'Army 3: rally out, nothing listed → attack-move at the M line\'s search point',
    expect: (sent, s) => has(sent, c => c.cmd === 'move' && c.attackMove && count(c, s) >= 8 && atSearch(c, s)) },
  // The same state one step on: the riflemen stand at the first `f?` field, now explored and empty of enemies; M's next point is the order.
  { id: 'search2', fixture: './fixtures/search2-t400.json', rule: 'Army 3: at the first f? field, nothing listed → on to the next search point',
    expect: (sent, s) => has(sent, c => c.cmd === 'move' && c.attackMove && count(c, s) >= 8 && atSearch(c, s)) },
  { id: 'wave', fixture: './fixtures/wave-t139.json', rule: 'Army 1/4: riflemen fighting a raid at home get no order; never chase',
    expect: (sent, s) => hold(sent, s) },
  // 2026-09-14 model campaign (games 50-54): the model's departures from the plan the script does not make.
  // game 50 (hub 70) n=102: a kill packet at 2:46 with 8 riflemen; the model committed the ball (Army 7 says 15). Hold.
  { id: 'sally', fixture: './fixtures/sally-t166.json', rule: 'Army 7: a kill packet with under 15 riflemen is not the commit',
    expect: (sent, s) => hold(sent, s) },
  // game 51 (hub 71) n=229: ore 235, the one barracks at q4, no second barracks in 5:37; the model attacked the core and bought nothing.
  { id: 'secondba', fixture: './fixtures/secondba-t337.json', rule: 'Buy 5: ore ≥ 200 and every barracks at q3+ → the second barracks',
    expect: sent => has(sent, c => c.cmd === 'build' && c.type === 'barracks') },
  // game 52 (hub 72) n=281: the ball is dead (tr2), the rally still out at a remembered depot, 705 ore banked; the model gathered.
  // Army 4: under 5 with the rally out → the attack has failed: rally home. Buy 5 holds too (q4, one barracks, 705 ore).
  { id: 'failed', fixture: './fixtures/failed-t401.json', rule: 'Army 4: rally out and under 5 riflemen → rally every barracks home',
    expect: (sent, s) => has(sent, c => c.cmd === 'rally' && c.x != null && D(c, s.myBase) <= 20) },
];

// The game25/game32 push rule, kept so the older arms can still be scored on the same fixture by anyone rescoring them: not a case.
export const pushOld = { id: 'pushOld', fixture: './fixtures/push-t143.json', rule: '3: turret up and 8 riflemen → the whole ball attack-moves at the enemy base',
  expect: (sent, s) => has(sent, c => c.cmd === 'move' && c.attackMove && count(c, s) >= 8 && towardEnemy(c, s) && atGoal(c, s)) };

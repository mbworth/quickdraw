// Per-decision rules from the frozen prompt (prompts/ashfall/game15-sonnet.md), scored over a trajectory: `when(state)` says
// whether the rule applies at that decision, `pass(sent, dropped, state)` whether the orders honoured it. Rates compare arms;
// the recording is scored the same way as its own reference. Never tune a rule to pass.
const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const isBld = t => ['core', 'barracks', 'depot', 'turret', 'wall', 'armory', 'sensor'].includes(t);
const finished = e => e.progress === undefined;
const troopers = s => s.mine.filter(e => e.type === 'trooper');
const turrets = s => s.mine.filter(e => e.type === 'turret');
const count = (c, s) => (c.units || []).reduce((n, v) => n + (typeof v === 'number' ? 1 : v === 'army' || v === 'all' || v === 'troopers' ? troopers(s).length : v === 'idle' ? troopers(s).filter(e => e.state === 'idle').length : 0), 0);
import { searchField } from '../../../../src/games/ashfall/coder.mjs';
const mirror = s => ({ x: -s.myBase.x, z: -s.myBase.z });
const towardEnemy = (c, s) => D(c, mirror(s)) < D(c, s.myBase);
const pushes = (sent, s) => sent.filter(c => c.cmd === 'move' && c.attackMove && towardEnemy(c, s));
const has = (sent, f) => sent.some(f);

export const rules = [
  { id: 'depot', text: '1: supply capped → depot', when: s => s.supply && s.supply.used >= s.supply.cap && s.ore >= 75 && !s.mine.some(e => e.type === 'depot' && !finished(e)),
    pass: sent => has(sent, c => c.cmd === 'build' && c.type === 'depot') },
  { id: 'spend', text: '1: spend everything', when: s => s.ore >= 120 && s.mine.some(e => e.type === 'barracks' && finished(e)),
    pass: sent => has(sent, c => ['train', 'build', 'research'].includes(c.cmd)) },
  // game38 (2026-09-14): the commit needs 15 riflemen AND a wave that just died (a kill trigger this packet); a per-state rule cannot see the trigger,
  // so the commit is not scored here (the turret rule went with the hard turret line, game 38 live). `noSally` scores the hold.
  { id: 'noSally', text: 'Army 6: under 15 riflemen never leave the post', when: s => troopers(s).length < 15 && !s.mine.some(b => b.type === 'barracks' && b.rally && D(b.rally, s.myBase) > 30),
    pass: (sent, dropped, s) => !has(pushes(sent, s), c => count(c, s) > 0 && D(c, s.myBase) > 30) },
  { id: 'wholeBall', text: '3: never push in pieces', when: (s, sent) => pushes(sent, s).length > 0,
    pass: (sent, dropped, s) => pushes(sent, s).every(c => count(c, s) >= 8) },
  { id: 'gatherNode', text: '4: gather with a node id', when: (s, sent) => sent.some(c => c.cmd === 'gather'),
    pass: sent => sent.filter(c => c.cmd === 'gather').every(c => c.ore != null) },
  { id: 'attackVisible', text: 'attack only what is visible', when: (s, sent, dropped) => sent.some(c => c.cmd === 'attack') || dropped.some(d => d.reason === 'no-target'),
    pass: (sent, dropped) => !dropped.some(d => d.reason === 'no-target') },
  { id: 'repair', text: '6: turret under 60% → repair', when: s => turrets(s).some(t => finished(t) && t.hp < 0.6 * t.max) && s.mine.some(e => e.type === 'worker'),
    pass: (sent, dropped, s) => { const t = new Set(turrets(s).filter(x => x.hp < 0.6 * x.max).map(x => x.id)); return has(sent, c => c.cmd === 'repair' && t.has(c.target)); } },
  // Until a building is listed, game25 says the mirror of my core and game32 says the packet's search waypoint; both count, nothing else.
  { id: 'pushTarget', text: '3: a push goes at a listed enemy building, or at the mirror of my core / the search waypoint until one is listed', when: (s, sent) => pushes(sent, s).some(c => count(c, s) >= 6),
    pass: (sent, dropped, s) => { const known = [...(s.enemyBuildingsRemembered || []), ...s.enemyVisible.filter(e => isBld(e.type))]; const goals = known.length ? known : [mirror(s), searchField(s).f, searchField(s, { guide: true }).f]; return pushes(sent, s).filter(c => count(c, s) >= 6).every(c => goals.some(g => D(c, g) <= 15)); } },
  { id: 'noChase', text: '6: do not chase with fewer than 8', when: s => s.enemyVisible.some(e => !isBld(e.type) && e.type !== 'worker') && troopers(s).length < 8,
    pass: (sent, dropped, s) => !has(sent, c => (c.cmd === 'move' || c.cmd === 'attack') && count(c, s) > 0 && (c.cmd === 'attack' || D(c, s.myBase) > 20)) },
];

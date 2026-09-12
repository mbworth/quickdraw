// Per-decision rules from the frozen prompt (prompts/ashfall/game15-sonnet.md), scored over a trajectory: `when(state)` says
// whether the rule applies at that decision, `pass(sent, dropped, state)` whether the orders honoured it. Rates compare arms;
// the recording is scored the same way as its own reference. Never tune a rule to pass.
const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const isBld = t => ['core', 'barracks', 'depot', 'turret', 'wall', 'armory', 'sensor'].includes(t);
const finished = e => e.progress === undefined;
const troopers = s => s.mine.filter(e => e.type === 'trooper');
const turrets = s => s.mine.filter(e => e.type === 'turret');
const count = (c, s) => (c.units || []).reduce((n, v) => n + (typeof v === 'number' ? 1 : v === 'army' || v === 'all' || v === 'troopers' ? troopers(s).length : v === 'idle' ? troopers(s).filter(e => e.state === 'idle').length : 0), 0);
const mirror = s => ({ x: -s.myBase.x, z: -s.myBase.z });
const towardEnemy = (c, s) => D(c, mirror(s)) < D(c, s.myBase);
const pushes = (sent, s) => sent.filter(c => c.cmd === 'move' && c.attackMove && towardEnemy(c, s));
const has = (sent, f) => sent.some(f);

export const rules = [
  { id: 'turret', text: '2: a turret at the anchor', when: s => s.time >= 60 && !turrets(s).length && s.ore >= 110 && s.mine.some(e => e.type === 'barracks'),
    pass: sent => has(sent, c => c.cmd === 'build' && c.type === 'turret') },
  { id: 'depot', text: '1: supply capped → depot', when: s => s.supply && s.supply.used >= s.supply.cap && s.ore >= 75 && !s.mine.some(e => e.type === 'depot' && !finished(e)),
    pass: sent => has(sent, c => c.cmd === 'build' && c.type === 'depot') },
  { id: 'spend', text: '1: spend everything', when: s => s.ore >= 120 && s.mine.some(e => e.type === 'barracks' && finished(e)),
    pass: sent => has(sent, c => ['train', 'build', 'research'].includes(c.cmd)) },
  { id: 'push8', text: '3: turret up and 8 idle riflemen → the ball attack-moves at the enemy base', when: s => turrets(s).some(finished) && !s.enemyVisible.length && troopers(s).filter(e => e.state === 'idle').length >= 8,
    pass: (sent, dropped, s) => has(pushes(sent, s), c => count(c, s) >= 8) },
  { id: 'wholeBall', text: '3: never push in pieces', when: (s, sent) => pushes(sent, s).length > 0,
    pass: (sent, dropped, s) => pushes(sent, s).every(c => count(c, s) >= 8) },
  { id: 'gatherNode', text: '4: gather with a node id', when: (s, sent) => sent.some(c => c.cmd === 'gather'),
    pass: sent => sent.filter(c => c.cmd === 'gather').every(c => c.ore != null) },
  { id: 'attackVisible', text: 'attack only what is visible', when: (s, sent, dropped) => sent.some(c => c.cmd === 'attack') || dropped.some(d => d.reason === 'no-target'),
    pass: (sent, dropped) => !dropped.some(d => d.reason === 'no-target') },
  { id: 'repair', text: '6: turret under 60% → repair', when: s => turrets(s).some(t => finished(t) && t.hp < 0.6 * t.max) && s.mine.some(e => e.type === 'worker'),
    pass: (sent, dropped, s) => { const t = new Set(turrets(s).filter(x => x.hp < 0.6 * x.max).map(x => x.id)); return has(sent, c => c.cmd === 'repair' && t.has(c.target)); } },
  { id: 'noChase', text: '6: do not chase with fewer than 8', when: s => s.enemyVisible.some(e => !isBld(e.type) && e.type !== 'worker') && troopers(s).length < 8,
    pass: (sent, dropped, s) => !has(sent, c => (c.cmd === 'move' || c.cmd === 'attack') && count(c, s) > 0 && (c.cmd === 'attack' || D(c, s.myBase) > 20)) },
];

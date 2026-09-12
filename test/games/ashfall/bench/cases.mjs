// Bench cases: a fixture state and what the frozen prompt (prompts/ashfall/game15-sonnet.md) says the order is at that moment.
// `expect(sent, state)` sees the orders after expand + validate (units are ids or selectors). Fixtures under ../fixtures (opening
// capture) and ./fixtures (scrubbed from live runs with bin/snapshot.mjs). Add a case when a rule breaks; never tune one to pass.
const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const troopers = s => s.mine.filter(e => e.type === 'trooper');
const count = (c, s) => (c.units || []).reduce((n, v) => n + (typeof v === 'number' ? 1 : v === 'army' || v === 'all' || v === 'troopers' ? troopers(s).length : v === 'idle' ? troopers(s).filter(e => e.state === 'idle').length : 0), 0);
const mirror = s => ({ x: -s.myBase.x, z: -s.myBase.z });
const towardEnemy = (c, s) => D(c, mirror(s)) < D(c, s.myBase);
const has = (sent, f) => sent.some(f);

export const cases = [
  { id: 'opening', fixture: '../fixtures/001-t0.json', rule: '1: no barracks → barracks; under 8 harvesters → harvester',
    expect: sent => has(sent, c => (c.cmd === 'build' && c.type === 'barracks') || (c.cmd === 'train' && c.type === 'worker')) },
  { id: 'train', fixture: '../fixtures/010-t46.json', rule: '1: income idle → riflemen at every barracks',
    expect: sent => has(sent, c => c.cmd === 'train' && c.type === 'trooper') },
  { id: 'capped', fixture: '../fixtures/013-t62.json', rule: '1: supply capped → depot',
    expect: sent => has(sent, c => c.cmd === 'build' && c.type === 'depot') },
  { id: 'turret', fixture: '../fixtures/034-t169.json', rule: '2: a turret ~8 from the core on the map-centre side',
    expect: sent => has(sent, c => c.cmd === 'build' && c.type === 'turret') },
  { id: 'push', fixture: './fixtures/push-t143.json', rule: '3: turret up and 8 riflemen → the whole ball attack-moves at the enemy base',
    expect: (sent, s) => has(sent, c => c.cmd === 'move' && c.attackMove && count(c, s) >= 8 && towardEnemy(c, s)) },
  { id: 'repair', fixture: './fixtures/repair-t267.json', rule: '6: turret under 60% → repair',
    expect: (sent, s) => { const t = new Set(s.mine.filter(e => e.type === 'turret').map(e => e.id)); return has(sent, c => c.cmd === 'repair' && t.has(c.target)); } },
  { id: 'dry', fixture: './fixtures/dry-t522.json', rule: '4: home fields dry, harvesters idle → gather at an explored node',
    expect: (sent, s) => { const nodes = new Set(s.fields.flatMap(f => (f.ore > 0 ? f.nodes.map(n => n.id) : []))); return has(sent, c => c.cmd === 'gather' && nodes.has(c.ore)); } },
  { id: 'core', fixture: './fixtures/core-t422.json', rule: '3/5: at the enemy base, attack what is visible (harvesters and barracks first, then the core)',
    expect: (sent, s) => { const core = s.enemyVisible.find(e => e.type === 'core'), vis = new Set(s.enemyVisible.map(e => e.id)); return !!core && has(sent, c => (c.cmd === 'attack' && vis.has(c.target)) || (c.cmd === 'move' && c.attackMove && D(c, core) <= 12)); } },
  // game 25: the ball went to the prompt's example coordinates 14 times with the barracks at 22,49 remembered; the M line was budget-dropped
  // The ball (7, idle, unhurt) sits at 64,24 with 2 reinforcements at the anchor: the ball goes at the listed building, never home.
  { id: 'remembered', fixture: './fixtures/remembered-t213.json', rule: '3: once M lists their buildings, the ball attack-moves at those coordinates; an unhurt ball never goes back to the anchor',
    expect: (sent, s) => has(sent, c => c.cmd === 'move' && c.attackMove && count(c, s) >= 6 && s.enemyBuildingsRemembered.some(b => D(c, b) <= 15)) },
  // game 25: no barracks until 97 s; `t wk 2` before `b ba` starved the build every decision (validate threads ore, so the build must survive it)
  { id: 'nobarracks', fixture: './fixtures/nobarracks-t60.json', rule: '1: no barracks → barracks, and it must be affordable after the rest of the batch',
    expect: sent => has(sent, c => c.cmd === 'build' && c.type === 'barracks') },
  { id: 'wave', fixture: './fixtures/wave-t139.json', rule: '6: do not chase; hold the anchor with fewer than 8',
    expect: (sent, s) => !has(sent, c => (c.cmd === 'move' || c.cmd === 'attack') && count(c, s) > 0 && (c.cmd === 'attack' || D(c, s.myBase) > 20)) },
];

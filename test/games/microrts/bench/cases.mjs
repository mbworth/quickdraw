// Bench cases: a fixture state and what the frozen plan (prompts/microrts/game01-sonnet.md) says the order is at that
// moment. `expect(sent, state)` sees the orders after expand + validate, so units are ids. Fixtures here are scrubbed
// states lifted from recorded runs; ../fixtures holds the opening capture. Add a case when a rule breaks; never tune one
// to pass.
const d1 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const mine = s => s.units.filter(u => u.player === s.me);
const foes = s => s.units.filter(u => u.player >= 0 && u.player !== s.me);
const of = (s, t) => mine(s).filter(u => u.type === t);
const base = s => of(s, 'Base')[0] || null;
const has = (sent, f) => sent.some(f);
const trains = (sent, type, by = null) => has(sent, c => c.cmd === 'train' && c.type === type && (by == null || c.building === by));
// an attack counts when it lands on the enemy or within a step of it: the order is a cell, the fight is adjacent
const at = (sent, p, r = 3) => has(sent, c => c.cmd === 'attack' && (c.target != null ? true : d1(c, p) <= r));

export const cases = [
  { id: 'opening', fixture: './fixtures/opening.json', rule: '1/2: the first worker mines and the base starts a worker',
    expect: (sent, s) => has(sent, c => c.cmd === 'harvest') && trains(sent, 'Worker', base(s).id) },
  { id: 'mine', fixture: './fixtures/mine.json', rule: '1: fewer than two workers on ore and one free → put it on the nearest node',
    expect: (sent, s) => { const ns = new Set(s.units.filter(u => s.tt[u.type]?.res).map(u => u.id)); return has(sent, c => c.cmd === 'harvest' && (c.node == null || ns.has(c.node))); } },
  { id: 'bank', fixture: './fixtures/bank.json', rule: '3: three workers and five banked with no barracks → a worker builds one',
    expect: (sent, s) => { const ids = new Set(of(s, 'Worker').map(u => u.id)); return has(sent, c => c.cmd === 'train' && c.type === 'Barracks' && ids.has(c.building)); } },
  { id: 'barracks', fixture: './fixtures/barracks.json', rule: '4: a finished barracks makes Light, not another worker',
    expect: (sent, s) => trains(sent, 'Light', of(s, 'Barracks')[0].id) },
  { id: 'light', fixture: './fixtures/light.json', rule: '4/7: a Light is never left standing — it guards the post or pushes',
    expect: (sent, s) => { const ids = new Set(of(s, 'Light').map(u => u.id)); return has(sent, c => c.cmd === 'attack' && (c.units || []).some(u => ids.has(u))); } },
  { id: 'near', fixture: './fixtures/near.json', rule: '5: an enemy within six of my base is met, not ignored',
    expect: (sent, s) => { const b = base(s); const e = foes(s).filter(u => s.tt[u.type]?.move && d1(u, b) <= 6).sort((p, q) => d1(p, b) - d1(q, b))[0]; return !!e && at(sent, e); } },
  { id: 'push', fixture: './fixtures/push.json', rule: '6: three Light out and nothing at home → everything goes at their base',
    expect: (sent, s) => { const b = foes(s).find(u => u.type === 'Base'); return !!b && has(sent, c => c.cmd === 'attack' && (c.target === b.id || d1(c, b) <= 2)); } },
  { id: 'raid', fixture: './fixtures/raid.json', rule: '5: at the door every worker fights, harvesters included',
    expect: (sent, s) => { const b = base(s); const e = foes(s).filter(u => s.tt[u.type]?.move && d1(u, b) <= 2)[0]; return !!e && at(sent, e) && !has(sent, c => c.cmd === 'harvest'); } },
];

// Per-decision rules from the frozen plan (prompts/microrts/game01-sonnet.md), scored over a trajectory: `when(state, sent,
// dropped)` says whether the rule applies at that decision, `pass(sent, dropped, state)` whether the orders honoured it.
// Rates compare arms; the recording is scored the same way as its own reference. Never tune a rule to pass.
const WK_COST = 1, BR_COST = 5, LI_COST = 2, HARV = 2, WK_CAP = 6, BR_AT = 3, DEFEND = 6, PANIC = 2;
const d1 = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const mine = s => s.units.filter(u => u.player === s.me);
const foes = s => s.units.filter(u => u.player >= 0 && u.player !== s.me);
const of = (s, t) => mine(s).filter(u => u.type === t);
const base = s => of(s, 'Base')[0] || null;
const barracks = s => of(s, 'Barracks')[0] || null;
const workers = s => of(s, 'Worker');
const mobile = s => mine(s).filter(u => s.tt[u.type]?.move);
const mining = s => workers(s).filter(u => u.st === 'harvest' || u.st === 'return');
const nodes = s => s.units.filter(u => s.tt[u.type]?.res && u.carry > 0);
const raider = s => { const b = base(s); return b ? foes(s).filter(u => s.tt[u.type]?.move && d1(u, b) <= DEFEND).sort((p, q) => d1(p, b) - d1(q, b))[0] : null; };
const has = (sent, f) => sent.some(f);
const named = sent => new Set(sent.flatMap(c => c.units || []));

export const rules = [
  { id: 'baseBusy', text: '2: the base never idles while the bank covers a worker and I am under the cap',
    when: s => !!base(s) && !base(s).busy && s.res[s.me] >= WK_COST && workers(s).length < WK_CAP,
    pass: (sent, dropped, s) => has(sent, c => c.cmd === 'train' && c.type === 'Worker' && c.building === base(s).id) },

  { id: 'harvesters', text: '1: two harvesters, topped up the moment one stops',
    when: s => nodes(s).length > 0 && mining(s).length < HARV && workers(s).length > mining(s).length && !(raider(s) && d1(raider(s), base(s)) <= PANIC),
    pass: sent => has(sent, c => c.cmd === 'harvest') },

  { id: 'barracks', text: '3: three workers and the bank at five with no barracks → build one',
    when: s => !barracks(s) && workers(s).length >= BR_AT && s.res[s.me] >= BR_COST && !mine(s).some(u => u.st === 'produce') && workers(s).some(u => u.st !== 'harvest' && u.st !== 'return'),
    pass: (sent, dropped, s) => { const ids = new Set(workers(s).map(u => u.id)); return has(sent, c => c.cmd === 'train' && c.type === 'Barracks' && ids.has(c.building)); } },

  { id: 'light', text: '4: a finished barracks makes Light whenever the bank covers one',
    when: s => !!barracks(s) && !barracks(s).busy && s.res[s.me] >= LI_COST,
    pass: (sent, dropped, s) => has(sent, c => c.cmd === 'train' && c.type === 'Light' && c.building === barracks(s).id) },

  { id: 'defend', text: '5: an enemy within six of my base is met by whatever is free',
    when: s => !!raider(s) && mobile(s).some(u => !u.busy && u.st !== 'produce' && !mining(s).includes(u)),
    pass: (sent, dropped, s) => { const e = raider(s); return has(sent, c => c.cmd === 'attack' && (c.target != null || d1(c, e) <= 3)); } },

  { id: 'panicMines', text: '5: at the door nobody mines',
    when: s => { const e = raider(s); return !!e && !!base(s) && d1(e, base(s)) <= PANIC; },
    pass: sent => !has(sent, c => c.cmd === 'harvest') },

  // 30 cycles is three decisions: shorter than that and the unit may simply be holding a goal the buffer has not
  // stepped yet, which a per-decision rule cannot see.
  { id: 'noIdle', text: '7: a mobile unit is never left standing with nothing to do',
    when: s => mobile(s).some(u => !u.busy && u.idleFor >= 30),
    pass: (sent, dropped, s) => { const n = named(sent); return mobile(s).filter(u => !u.busy && u.idleFor >= 30).every(u => n.has(u.id)); } },

  { id: 'ordersLand', text: 'an order the engine cannot take is a plan error, not a fact of the game',
    when: (s, sent, dropped) => sent.length > 0 || dropped.length > 0,
    pass: (sent, dropped) => !dropped.some(d => ['dead', 'bad-type', 'bad-id', 'wall', 'gone'].includes(d.reason)) },
];

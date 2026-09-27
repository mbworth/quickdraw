import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createObserver, CLASSIFIERS, fight, matchLine } from '../../../src/games/microrts/policy/observe.mjs';
import { createObserver as fromCommander } from '../../../src/games/microrts/policy/commander.mjs';
import { DEFAULTS } from '../../../src/games/microrts/policy/rush.mjs';
import { ROOT } from '../../../bin/_boot.mjs';

const pk = ({ t, r = 0, d = 'none', tr = 'none', p = 'ba#20 IDLE', a = [], b = 'ba#20@2,2 hp10', x = [], l = 'none', e = [] }) =>
  [`H t${t} r${r} u${a.length}/${x.length}`, `D ${d}`, `T ${tr}`, `P ${p}`, e.length ? `E\n${e.join('\n')}` : 'E none', a.length ? `A\n${a.join('\n')}` : 'A none', `B ${b}`, x.length ? `X\n${x.join('\n')}` : 'X none', `L ${l}`].join('\n');
const feed = (o, packets) => { for (const q of packets) o.see(pk(q)); return o; };
const line = (o, name, { expect = null, params = null } = {}) => o.read(params, { expect })?.split('\n').find(l => l.startsWith(`O ${name}:`)) ?? null;
const BANNED = /\b(afford|should|build|counter|recommend|attack|rush|reachable|unreachable|holds|crossing|gain|now)/i;
const FORMAT = /^O (near|home|reach|foe|fight|gone|econ|trig|units|match|push|mine): /;

test('no classifiers: read() is null; all enables every one; commander.mjs re-exports it', () => {
  assert.equal(feed(createObserver(), [{ t: 0 }]).read(null), null);
  const o = feed(createObserver({ classifiers: 'all' }), [{ t: 0 }]);
  assert.match(o.read(DEFAULTS), /^O near: their mobile none\nO home: my base hp10; my army 0; my wk 0 at base; their nearest mobile none\nO trig: .*\nO econ: my bank 0\nO units: my none vs their none \| li 4hp 2dmg cost 2 80c: kills wk 1 swing, li 2, hv 4, rg 1 \| hv 8hp 4dmg cost 3 120c: kills wk 1, li 1, hv 2, rg 1 \| rg 1hp 1dmg range 3 cost 2 100c: kills wk 1, li 4, hv 8, rg 1\nO match: my none vs their none\nO mine: harvesters 2: no node with ore$/);
  assert.equal(fromCommander, createObserver);
  assert.deepEqual(CLASSIFIERS, ['near', 'home', 'reach', 'trig', 'foe', 'fight', 'gone', 'econ', 'units', 'match', 'push', 'mine']);
});

test('validation: an unknown name or a non-string/non-array throws', () => {
  assert.throws(() => createObserver({ classifiers: 'near,threat' }), /unknown classifier "threat"/);
  assert.throws(() => createObserver({ classifiers: 5 }), /string or an array/);
  assert.throws(() => createObserver({ classifiers: ['econ', 'afford'] }), /unknown classifier/);
});

test('only enabled classifiers speak; an unreadable packet is ignored', () => {
  const o = createObserver({ classifiers: 'near, econ' });
  o.see('garbage');
  assert.equal(o.read(null), null);
  feed(o, [{ t: 0, x: ['li x2@13,13 d22/20 #5,#6'] }]);
  assert.deepEqual(o.read(null).split('\n').map(l => l.split(':')[0]), ['O near', 'O econ']);
});

test('near: combat unit within 12 beats a nearer worker; "was" only for the same cluster', () => {
  const o = feed(createObserver({ classifiers: ['near'] }), [
    { t: 300, x: ['li x2@13,13 d20/18', 'wk x1@3,3 d1/1 #9'] },
    { t: 400, x: ['li x2@11,11 d15/10', 'wk x1@3,3 d1/1 #9'] },
    { t: 450, x: ['li x2@9,9 d9/5', 'wk x1@3,3 d1/1 #9'] },
  ]);
  assert.equal(line(o, 'near'), 'O near: their li x2 @9,9 d9 to my base, was d15 @t400');
  const o2 = feed(createObserver({ classifiers: ['near'] }), [
    { t: 300, x: ['li x1@13,2 d15/10 #7'] },
    { t: 400, x: ['li x1@2,13 d13/8 #8'] },
  ]);
  assert.equal(line(o2, 'near'), 'O near: their li x1 @2,13 d13 to my base');
  const o3 = feed(createObserver({ classifiers: ['near'] }), [{ t: 300, x: ['wk x1@5,5 d7/5 #9'] }, { t: 350, x: ['wk x1@3,3 d1/1 #9', 'li x1@14,14 d24/20 #7'] }]);
  assert.equal(line(o3, 'near'), 'O near: their wk x1 @3,3 d1 to my base, was d7 @t300');
});

test('home: army within defend of my base vs the rest as a range; workers at base; no base; no enemy mobile', () => {
  const a = ['li x2@10,12 i #1,#2', 'li x1@12,12 i #3', 'wk x3@1,2 h #4,#5,#6', 'wk x2@9,9 i #7,#8'];
  const o = feed(createObserver({ classifiers: 'home' }), [{ t: 300, a, x: ['li x1@6,6 d8/4 #9', 'wk x1@12,12 d20/2 #10'] }]);
  assert.equal(line(o, 'home', { params: DEFAULTS }), 'O home: my base hp10; my army 3: 0 within d6 of my base, 3 at d18-20; my wk 3 at base; their nearest mobile d8');
  assert.equal(line(o, 'home'), 'O home: my base hp10; my army 3: 0 within d6 of my base, 3 at d18-20; my wk 3 at base; their nearest mobile d8');
  assert.equal(line(o, 'home', { params: { ...DEFAULTS, defend: 18 } }), 'O home: my base hp10; my army 3: 2 within d18 of my base, 1 at d20; my wk 5 at base; their nearest mobile d8');
  const nb = feed(createObserver({ classifiers: 'home' }), [{ t: 300, a, b: 'none', x: ['li x1@6,6 d-/4 #9'] }]);
  assert.equal(line(nb, 'home'), 'O home: my base gone; my army 3; my wk 5; their nearest mobile none');
  const nx = feed(createObserver({ classifiers: 'home' }), [{ t: 300, a: ['li x1@3,3 i #1', 'wk x1@2,3 h #4'], x: ['ba x1@13,13 d22/20 #21'] }]);
  assert.equal(line(nx, 'home'), 'O home: my base hp10; my army 1: 1 within d6 of my base; my wk 1 at base; their nearest mobile none');
});

test('reach: count and window since the claim; no change; opposite-sign gap; per-cycle rate', () => {
  const li = n => Array.from({ length: n }, (_, i) => `li x1@3,${i} i #${100 + i}`);
  const o = feed(createObserver({ classifiers: ['reach'] }), [{ t: 200, a: li(0) }, { t: 250, a: li(1) }, { t: 340, a: li(2) }]);
  const e = { metric: 'li', op: '>=', value: 3, by: 400, since: 250 };
  assert.equal(line(o, 'reach', { expect: e }), 'O reach: li>=3 by t400: my li 2, +1 in last 90c since t250');
  assert.equal(line(o, 'reach', { expect: { ...e, since: 340 } }), 'O reach: li>=3 by t400: my li 2, no change since t340');
  assert.equal(line(o, 'reach', { expect: { ...e, op: '<=', value: 0 } }), 'O reach: li<=0 by t400: my li 2, gap -2, rate +1/90c since t250');
  assert.equal(line(o, 'reach'), null);
  const b = feed(createObserver({ classifiers: ['reach'] }), [{ t: 100, r: 0 }, { t: 110, r: 40 }]);
  assert.equal(line(b, 'reach', { expect: { metric: 'bank', op: '>=', value: 50, by: 200, since: 100 } }), 'O reach: bank>=50 by t200: my bank 40, +4/c since t100');
});

test('trig: the reflex triggers in force against the board', () => {
  const o = feed(createObserver({ classifiers: ['trig'] }), [
    { t: 300, a: ['wk x4@1,1 h #1,#2,#3,#4'], x: ['wk x1@9,9 d14/10 #9'] },
    { t: 400, a: ['wk x4@1,1 h #1,#2,#3,#4', 'li x1@3,3 i #5'], x: ['wk x1@6,6 d8/5 #9'] },
  ]);
  assert.equal(line(o, 'trig', { params: DEFAULTS }),
    'O trig: pushLight 3: my army 1 (+1 in last 100c); barracksAt 3: my wk 4, br 0; pushWorkers 6: my fighters 3; defend 6/panic 2: their nearest mobile d8, outside defend');
  assert.equal(line(o, 'trig'), null);
});

test('foe: first barracks until t600, alive/peak per type and change over ~300c', () => {
  const o = feed(createObserver({ classifiers: ['foe'] }), [
    { t: 100, x: ['wk x6@13,13 d22/20'] },
    { t: 180, x: ['wk x6@13,13 d22/20', 'br x1@14,12 d22/20 #40'] },
    { t: 300, x: ['li x1@12,12 d20/18 #50', 'wk x6@13,13 d22/20', 'br x1@14,12 d22/20 #40'] },
    { t: 600, x: ['li x4@10,10 d16/12', 'wk x5@13,13 d22/20', 'br x1@14,12 d22/20 #40'] },
  ]);
  assert.equal(line(o, 'foe'), 'O foe: their br 1 (first t180); their wk 5 (peak 6, -1 since t300); their li 4 (peak 4, +3 since t300)');
  feed(o, [{ t: 700, x: ['li x1@10,10 d16/12 #51', 'br x1@14,12 d22/20 #40'] }]);
  assert.equal(line(o, 'foe'), 'O foe: their br 1; their wk 0 (peak 6, -5 since t600); their li 1 (peak 4, -3 since t600)');
});

test('fight: placed deaths collapse; a stale or missing position goes to the place-unknown bucket; last 2 kept', () => {
  const o = feed(createObserver({ classifiers: ['fight'] }), [
    { t: 100, a: ['li x2@6,7 a #1,#2'], x: ['wk x1@6,8 d9/1 #9'] },
    { t: 110, a: ['li x1@6,7 a #1'], d: '-li#2 E-wk#9', tr: 'lost li#2; kill wk#9' },
    { t: 125, d: '-li#1', tr: 'lost li#1' },
  ]);
  assert.equal(line(o, 'fight'), 'O fight: t110-125 @6,7: lost my li x2, killed their wk x1');
  const o2 = feed(createObserver({ classifiers: ['fight'] }), [
    { t: 100, a: ['wk x1@1,1 h #3'], x: ['wk x1@6,8 d9/1 #9'] },
    { t: 110, a: ['wk x1@1,1 h #3'], x: ['wk x1@2,2 d1/1 #9'], d: 'E-wk#77', tr: 'kill wk#77' },
    { t: 120, a: ['wk x1@1,1 h #3'], d: 'E-wk#9', tr: 'kill wk#9' },
    { t: 190 }, { t: 200, tr: 'lost wk#3' },
    { t: 1005, tr: 'kill wk#80' }, { t: 1030, tr: 'kill wk#81; kill wk#82' },
  ]);
  assert.equal(line(o2, 'fight'), 'O fight: t200: lost my wk x1 (place unknown); t1005-1030: killed their wk x3 (place unknown)');
});

test('gone: building kept while a no-id cluster stands within 1; newest 2; mobile type at 0 with its peak', () => {
  const o = feed(createObserver({ classifiers: ['gone'] }), [
    { t: 100, x: ['ba x1@13,13 d22/20 #21', 'br x1@14,12 d22/20 #40', 'br x1@9,9 d14/10 #41', 'li x4@10,10 d16/12'] },
    { t: 200, x: ['ba x1@13,13 d22/20 #21', 'br x2@14,11 d22/20', 'br x1@9,9 d14/10 #41'] },
  ]);
  assert.equal(line(o, 'gone'), 'O gone: their li 0 since t200 (peak 4)');
  feed(o, [{ t: 300, x: ['ba x1@13,13 d22/20 #21'] }, { t: 400, x: ['li x1@10,10 d16/12 #60'] }]);
  assert.equal(line(o, 'gone'), 'O gone: their ba#21 since t400; their br#40 since t300');
});

test('gone and fight restate on every read; a packet without X leaves gone alone', () => {
  const o = feed(createObserver({ classifiers: 'fight,gone' }), [
    { t: 100, a: ['li x1@6,7 a #1'], x: ['br x1@14,12 d22/20 #40'] },
    { t: 110, d: '-li#1', tr: 'lost li#1' },
  ]);
  assert.equal(o.read(null), 'O fight: t110 @6,7: lost my li x1\nO gone: their br#40 since t110');
  assert.equal(o.read(null), 'O fight: t110 @6,7: lost my li x1\nO gone: their br#40 since t110');
  const o2 = feed(createObserver({ classifiers: 'gone' }), [{ t: 100, x: ['br x1@14,12 d22/20 #40'] }]);
  o2.see(pk({ t: 120 }).replace(/\nX none/, ''));
  assert.equal(o2.read(null), null);
});

test('econ: bank, committed, mined and spent by charge, idle per building', () => {
  const o = feed(createObserver({ classifiers: ['econ'] }), [
    { t: 500, r: 3, p: 'ba#20 wk 30; br#40 IDLE', b: 'ba#20@2,2 hp10 br#40@0,2 hp4' },
    { t: 540, r: 3, p: 'ba#20 wk 1; br#40 li 50', b: 'ba#20@2,2 hp10 br#40@0,2 hp4' },
    { t: 560, r: 3, p: 'ba#20 IDLE; br#40 li 30', b: 'ba#20@2,2 hp10 br#40@0,2 hp4' },
    { t: 600, r: 1, p: 'ba#20 IDLE; br#40 li 70', b: 'ba#20@2,2 hp10 br#40@0,2 hp4 br#41@4,2 hp4' },
  ]);
  assert.equal(line(o, 'econ'), 'O econ: my bank 1 (2 committed); mined +6/100c, spent 8/100c (wk 1, li 1, br 1); ba#20 idle 40/100c, br#40 idle 40/100c');
});

test('units: my/their combat counts, li/hv/rg stats, swing labeled once', () => {
  const o = feed(createObserver({ classifiers: ['units'] }), [
    { t: 300, a: ['li x2@10,12 i #1,#2'], x: ['li x3@6,6 d8/4'] },
  ]);
  assert.equal(line(o, 'units'),
    'O units: my li x2 vs their li x3 | li 4hp 2dmg cost 2 80c: kills wk 1 swing, li 2, hv 4, rg 1 | hv 8hp 4dmg cost 3 120c: kills wk 1, li 1, hv 2, rg 1 | rg 1hp 1dmg range 3 cost 2 100c: kills wk 1, li 4, hv 8, rg 1');
  const none = feed(createObserver({ classifiers: ['units'] }), [{ t: 0 }]);
  assert.match(line(none, 'units'), /^O units: my none vs their none \|/);
});

test('fight: UTT model, rg gets 2 free ranged rounds before melee closes', () => {
  // li 4hp 2dmg vs li: both sides focus-fire the front unit each round; 2 mine die outright, 3 theirs whittle to 2 survivors
  assert.deepEqual(fight({ li: 2 }, { li: 3 }), { mine: {}, theirs: { li: 2 } });
  // symmetric 3v3 li: both sides trade down to 0 together by round 5
  assert.deepEqual(fight({ li: 3 }, { li: 3 }), { mine: {}, theirs: {} });
  // 2 hv (8hp 4dmg) one-shot a li each per round; 3 li (2dmg) need 4 hits to kill a hv (8/2)
  assert.deepEqual(fight({ hv: 2 }, { li: 3 }), { mine: { hv: 1 }, theirs: {} });
  // hv front-load kills, li mop up the last li; mine lose 1 li, keep the rest
  assert.deepEqual(fight({ li: 2, hv: 2 }, { li: 3 }), { mine: { li: 1, hv: 2 }, theirs: {} });
  // rg (1hp 1dmg range 3) get 2 free rounds of chip damage before li close in and kill all 3 rg
  assert.deepEqual(fight({ rg: 3 }, { li: 3 }), { mine: {}, theirs: { li: 1 } });
  // no enemy: no rounds run
  assert.deepEqual(fight({ li: 1 }, {}), { mine: { li: 1 }, theirs: {} });
});

test('matchLine: current fight plus what +6 ore of each type would buy', () => {
  assert.equal(matchLine({ li: 2 }, { li: 3 }),
    'my li x2 vs their li x3: I strike first: none left / they strike first: they keep li x3 | +6 ore li x3 (240c) = my li x5: I strike first: I keep li x5 / they strike first: I keep li x2 | +6 ore hv x2 (240c) = my li x2 hv x2: I strike first: I keep li x2 hv x2 / they strike first: I keep hv x2 | +6 ore rg x3 (300c) = my li x2 rg x3: I strike first: I keep li x2 rg x2 / they strike first: they keep li x1');
  assert.equal(matchLine({}, {}), 'my none vs their none');
});

test('matchLine: bank below ore waits on measured income, or spends the bank with no income', () => {
  const rows = o => matchLine({ li: 2 }, { li: 3 }, o).split(' | ').map(r => r.split(' = ')[0]);
  assert.equal(matchLine({ li: 2 }, { li: 3 }, { bank: 9, rate: 0 }), matchLine({ li: 2 }, { li: 3 }));
  assert.deepEqual(rows({ bank: 2, rate: 0.02 }).slice(1), ['+6 ore li x3 (280c at +2/100c)', '+6 ore hv x2 (320c at +2/100c)', '+6 ore rg x3 (300c at +2/100c)']);
  assert.deepEqual(rows({ bank: 2, rate: 0 }).slice(1), ['+2 ore li x1 (80c)', '+2 ore rg x1 (100c)', 'no income']);
  assert.deepEqual(rows({ bank: 0, rate: 0 }).slice(1), ['no income']);
});

test('match: the units/fight classifier through the observer', () => {
  const o = feed(createObserver({ classifiers: ['match'] }), [{ t: 300, a: ['li x2@10,12 i #1,#2'], x: ['li x3@6,6 d8/4'] }]);
  assert.equal(line(o, 'match'),
    'O match: my li x2 vs their li x3: I strike first: none left / they strike first: they keep li x3 | +6 ore li x3 (240c) = my li x5: I strike first: I keep li x5 / they strike first: I keep li x2 | +6 ore hv x2 (240c) = my li x2 hv x2: I strike first: I keep li x2 hv x2 / they strike first: I keep hv x2 | +6 ore rg x3 (300c) = my li x2 rg x3: I strike first: I keep li x2 rg x2 / they strike first: they keep li x1');
  const none = feed(createObserver({ classifiers: ['match'] }), [{ t: 0 }]);
  assert.equal(line(none, 'match'), 'O match: my none vs their none');
});

test('recorded run: every line is a fact in the O format, under 60 words (units 80, match 140: a row per unit type, both first-strike cases), no verdict words', t => {
  const file = path.join(ROOT, 'runs/microrts-basesWorkers16x16-GuidedRojoA3N-mub5ms7q.jsonl');
  if (!fs.existsSync(file)) return t.skip('run file absent');
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(r => r.kind === 'call' && r.packet);
  const o = createObserver({ classifiers: 'all' });
  const expect = { metric: 'li', op: '>=', value: 6, by: 1500, since: 600 };
  let n = 0;
  for (const r of rows) {
    o.see(r.packet);
    for (const l of (o.read(DEFAULTS, { expect }) || '').split('\n').filter(Boolean)) {
      n++;
      assert.match(l, FORMAT);
      assert.ok(l.split(/\s+/).length <= (l.startsWith('O match:') ? 140 : l.startsWith('O units:') ? 80 : 60), l);
      assert.doesNotMatch(l, BANNED, l);
    }
  }
  assert.ok(n > rows.length * 4);
});

const evFeed = (classifiers, packets, params = DEFAULTS) => { const o = createObserver({ classifiers }); const out = []; for (const q of packets) { o.see(pk(q), params); out.push(...o.events()); } return { o, out }; };

test('events: gone once per building and per mobile type at 0 after peak 2; the first packet is the baseline; events() clears', () => {
  const { o, out } = evFeed('gone', [
    { t: 100, x: ['ba x1@13,13 d22/20 #21', 'li x2@10,10 d16/12'] },
    { t: 200, x: ['ba x1@13,13 d22/20 #21'] },
    { t: 210, x: ['ba x1@13,13 d22/20 #21'] },
    { t: 300, x: ['wk x1@12,12 d20/18 #9'] },
    { t: 310, x: ['wk x1@12,12 d20/18 #9'] },
  ]);
  assert.deepEqual(out, ['gone: their li 0 t200 (peak 2)', 'gone: their ba#21 gone t300']);
  assert.deepEqual(o.events(), []);
  assert.deepEqual(evFeed('econ', [{ t: 100, x: ['ba x1@13,13 d22/20 #21'] }, { t: 200 }]).out, []);   // off: silent
});

test('home: my base hp, was hp ~100c earlier when different', () => {
  const o = feed(createObserver({ classifiers: 'home' }), [{ t: 300 }, { t: 350, b: 'ba#20@2,2 hp8' }]);
  assert.equal(line(o, 'home'), 'O home: my base hp8, was hp10 @t300; my army 0; my wk 0 at base; their nearest mobile none');
  feed(o, [{ t: 460, b: 'ba#20@2,2 hp8' }]);
  assert.equal(line(o, 'home'), 'O home: my base hp8; my army 0; my wk 0 at base; their nearest mobile none');
});

test('mine: k-th harvester on k-th node by d then id; next; d from their ba when nearer theirs; share; no ore; no E', () => {
  const e = ['rs#16@0,0 o17 d4', 'rs#17@1,0 o10 d3', 'rs#18@14,15 o11 d25', 'rs#19@15,15 o25 d26', 'rs#20@0,1 o0 d3'];
  const x = ['ba x1@13,13 d22/20 #21'];
  const o = feed(createObserver({ classifiers: 'mine' }), [{ t: 100, e, x }]);
  const m = h => line(o, 'mine', { params: { harvesters: h } });
  assert.equal(line(o, 'mine'), 'O mine: harvesters 2: 1st rs#17 d3 o10; 2nd rs#16 d4 o17; next 3rd rs#18 d25 o11, d3 from their ba');
  assert.equal(m(4), 'O mine: harvesters 4: 1st rs#17 d3 o10; 2nd rs#16 d4 o17; 3rd rs#18 d25 o11, d3 from their ba; 4th rs#19 d26 o25, d4 from their ba');
  assert.equal(m(5), 'O mine: harvesters 5: 1st rs#17 d3 o10; 2nd rs#16 d4 o17; 3rd rs#18 d25 o11, d3 from their ba; 4th rs#19 d26 o25, d4 from their ba; 1 more share rs#19');
  const nb = feed(createObserver({ classifiers: 'mine' }), [{ t: 100, e }]);
  assert.equal(line(nb, 'mine', { params: { harvesters: 2 } }), 'O mine: harvesters 2: 1st rs#17 d3 o10; 2nd rs#16 d4 o17; next 3rd rs#18 d25 o11');
  assert.equal(line(feed(createObserver({ classifiers: 'mine' }), [{ t: 100, e: ['rs#16@0,0 o0 d4'] }]), 'mine'), 'O mine: harvesters 2: no node with ore');
  const ne = createObserver({ classifiers: 'mine' }); ne.see(pk({ t: 100 }).replace(/\nE none/, ''));
  assert.equal(line(ne, 'mine'), null);
});

test('events: home needs 3 units, a majority past defend+2 to leave, all within defend to return; an oscillating minority and a lone sortie stay silent; base lost still fires', () => {
  const { out } = evFeed('home', [
    { t: 100, a: ['li x3@3,3 i #1,#2,#3'] },                              // all d2: baseline in
    { t: 110, a: ['li x2@3,3 i #1,#2', 'li x1@2,9 i #3'] },               // one at d7 (defend+1): not majority, not all-in — holds
    { t: 120, a: ['li x3@3,3 i #1,#2,#3'] },                              // back together — holds
    { t: 130, a: ['li x1@3,3 i #1', 'li x2@2,11 i #2,#3'] },              // two of three at d9: majority past defend+2 — fires out
    { t: 140, a: ['li x1@3,3 i #1', 'li x2@2,11 i #2,#3'] },              // still out — holds
    { t: 150, a: ['li x3@3,3 i #1,#2,#3'] },                              // all back within defend — fires in
    { t: 160, a: ['li x1@2,11 i #1'] },                                   // lone sortie — silent
    { t: 170 },                                                           // army 0 — silent
    { t: 180, b: 'none' },                                                // base lost — fires
  ]);
  assert.deepEqual(out, [
    'home: my army 3: 2 past d8 of my base t130',
    'home: my army 3: all within d6 of my base t150',
    'home: my base lost t180',
  ]);
});

test('events: near enters at defend, holds through the buffer band, leaves only past defend+2 or none', () => {
  const { out } = evFeed('near', [
    { t: 100, x: ['li x1@20,20 d20/5 #9'] },   // far: baseline out
    { t: 110, x: ['li x1@10,13 d7/5 #9'] },    // d7 (defend+1): not <= defend — holds out
    { t: 120, x: ['li x1@5,5 d6/5 #9'] },      // d6 (<=defend) — fires in
    { t: 130, x: ['li x1@10,13 d7/5 #9'] },    // back to d7 — holds in (not past defend+2)
    { t: 140, x: ['li x1@11,13 d8/5 #9'] },    // d8 (defend+2, not past it) — holds in
    { t: 150, x: ['li x1@12,13 d9/5 #9'] },    // d9 (past defend+2) — fires out
    { t: 160 },                                // no enemy mobile — holds out
  ]);
  assert.deepEqual(out, [
    'near: their li x1 @5,5 d6 to my base, inside d6 t120',
    'near: their combat units none within d6 of my base t150 (nearest d9)',
  ]);
});

test('events: foe first sightings, fight starts, trig crossings (a pushLight change is silent)', () => {
  const li = n => Array.from({ length: n }, (_, i) => `li x1@3,${i} i #${100 + i}`);
  const { o, out } = evFeed('foe,fight,trig', [
    { t: 100, a: li(1), x: ['wk x2@13,13 d22/20'] },
    { t: 110, a: li(3), x: ['wk x2@13,13 d22/20', 'br x1@14,12 d22/20 #40'] },
    { t: 120, a: li(3), x: ['wk x2@13,13 d22/20', 'br x1@14,12 d22/20 #40', 'li x1@12,12 d20/18 #50'] },
    { t: 130, a: li(2), d: '-li#102', tr: 'lost li#102' },
  ]);
  assert.deepEqual(out, ['foe: their br first seen t110', 'trig: my army 3 at or above pushLight 3 t110', 'foe: their li first seen t120', 'fight: new fight t130 @3,2: lost my li', 'trig: my army 2 below pushLight 3 t130']);
  o.see(pk({ t: 140, a: li(2) }), { ...DEFAULTS, pushLight: 2 });
  assert.deepEqual(o.events(), []);
});

test('events: econ once per idle stretch with bank >= 2, and bank crossing 10 while a producer idles', () => {
  const { out } = evFeed('econ', [
    { t: 100, r: 3, p: 'ba#20 IDLE' },
    { t: 150, r: 3, p: 'ba#20 IDLE' },
    { t: 200, r: 4, p: 'ba#20 IDLE' },
    { t: 250, r: 9, p: 'ba#20 IDLE' },
    { t: 260, r: 11, p: 'ba#20 IDLE' },
    { t: 270, r: 11, p: 'ba#20 wk 40' },
    { t: 300, r: 11, p: 'ba#20 IDLE' },
    { t: 400, r: 11, p: 'ba#20 IDLE' },
  ]);
  assert.deepEqual(out, ['econ: my ba#20 idle 100c, bank 4 t200', 'econ: my bank 11 crossed 10, ba#20 idle t260', 'econ: my ba#20 idle 100c, bank 11 t400']);
});

test('push: distance to their base, was, order destinations by packet over ~100c; ba gone falls back to the nearest building; null cases', () => {
  const x = ['ba x1@13,13 d22/20 #21', 'br x1@14,12 d22/20 #40'], li = at => [`li x3@${at} a #1,#2,#3`, 'wk x1@2,3 a #9'];
  const o = createObserver({ classifiers: 'push' });
  const see = q => o.see(pk({ x, ...q }), { defend: 6 });
  see({ t: 100, a: li('3,3'), l: 'a #1,#2,#3 13,13 ok' });
  assert.equal(line(o, 'push'), 'O push: my army 3 nearest d20 to their ba@13,13; orders last 0c: 1 at their ba');
  see({ t: 150, a: li('8,8'), l: 'a #1,#2 #40 ok' });
  assert.equal(line(o, 'push'), 'O push: my army 3 nearest d10 to their ba@13,13, was d20 @t100; orders last 50c: 1 at their br');
  see({ t: 200, a: li('7,7'), l: 'a #1,#2,#3 7,6 ok; a #9 13,13 ok' });
  see({ t: 210, a: li('6,6'), l: 'a #1 3,4 ok; a #2 #77 ok' });
  see({ t: 220, a: li('6,6'), l: 'a #9 13,13 ok' });
  assert.equal(line(o, 'push'), 'O push: my army 3 nearest d14 to their ba@13,13, was d10 @t150; orders last 70c: 1 at their unit, 1 between, 1 at my base');
  o.see(pk({ t: 230, a: li('6,6'), x: ['br x1@14,12 d22/20 #40', 'br x1@6,9 d11/3 #41'] }));
  assert.equal(line(o, 'push'), 'O push: my army 3 nearest d3 to their br@6,9, was d3 @t150; orders last 80c: 1 at their unit, 1 between, 1 at my base');
  assert.equal(line(feed(createObserver({ classifiers: 'push' }), [{ t: 100, a: ['wk x2@3,3 i #1,#2'], x }]), 'push'), null);
  assert.equal(line(feed(createObserver({ classifiers: 'push' }), [{ t: 100, a: ['li x1@3,3 i #1'], x: ['li x1@9,9 d14/12 #7'] }]), 'push'), null);
});

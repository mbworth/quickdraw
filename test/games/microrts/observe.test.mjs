import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createObserver, CLASSIFIERS } from '../../../src/games/microrts/policy/observe.mjs';
import { createObserver as fromCommander } from '../../../src/games/microrts/policy/commander.mjs';
import { DEFAULTS } from '../../../src/games/microrts/policy/rush.mjs';
import { ROOT } from '../../../bin/_boot.mjs';

const pk = ({ t, r = 0, d = 'none', tr = 'none', p = 'ba#20 IDLE', a = [], b = 'ba#20@2,2 hp10', x = [] }) =>
  [`H t${t} r${r} u${a.length}/${x.length}`, `D ${d}`, `T ${tr}`, `P ${p}`, 'E none', a.length ? `A\n${a.join('\n')}` : 'A none', `B ${b}`, x.length ? `X\n${x.join('\n')}` : 'X none', 'L none'].join('\n');
const feed = (o, packets) => { for (const q of packets) o.see(pk(q)); return o; };
const line = (o, name, { expect = null, params = null } = {}) => o.read(params, { expect })?.split('\n').find(l => l.startsWith(`O ${name}:`)) ?? null;
const BANNED = /\b(afford|should|build|counter|recommend|attack|rush|reachable|unreachable|holds|crossing|gain|now)/i;
const FORMAT = /^O (near|home|reach|foe|fight|gone|econ|trig): /;

test('no classifiers: read() is null; all enables every one; commander.mjs re-exports it', () => {
  assert.equal(feed(createObserver(), [{ t: 0 }]).read(null), null);
  const o = feed(createObserver({ classifiers: 'all' }), [{ t: 0 }]);
  assert.match(o.read(DEFAULTS), /^O near: their mobile none\nO home: my army 0; my wk 0 at base; their nearest mobile none\nO trig: .*\nO econ: my bank 0$/);
  assert.equal(fromCommander, createObserver);
  assert.deepEqual(CLASSIFIERS, ['near', 'home', 'reach', 'trig', 'foe', 'fight', 'gone', 'econ']);
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
  assert.equal(line(o, 'home', { params: DEFAULTS }), 'O home: my army 3: 0 within d6 of my base, 3 at d18-20; my wk 3 at base; their nearest mobile d8');
  assert.equal(line(o, 'home'), 'O home: my army 3: 0 within d6 of my base, 3 at d18-20; my wk 3 at base; their nearest mobile d8');
  assert.equal(line(o, 'home', { params: { ...DEFAULTS, defend: 18 } }), 'O home: my army 3: 2 within d18 of my base, 1 at d20; my wk 5 at base; their nearest mobile d8');
  const nb = feed(createObserver({ classifiers: 'home' }), [{ t: 300, a, b: 'none', x: ['li x1@6,6 d-/4 #9'] }]);
  assert.equal(line(nb, 'home'), 'O home: my army 3: no base; my wk 5; their nearest mobile none');
  const nx = feed(createObserver({ classifiers: 'home' }), [{ t: 300, a: ['li x1@3,3 i #1', 'wk x1@2,3 h #4'], x: ['ba x1@13,13 d22/20 #21'] }]);
  assert.equal(line(nx, 'home'), 'O home: my army 1: 1 within d6 of my base; my wk 1 at base; their nearest mobile none');
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
    'O trig: pushLight 3: my army 1 (+1 in last 100c); barracksAt 3: my wk 4, br 0; pushWorkers 6: my fighters 3; defend 6/panic 2: their nearest mobile d8');
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

test('recorded run: every line is a fact in the O format, under 60 words, no verdict words', t => {
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
      assert.ok(l.split(/\s+/).length <= 60, l);
      assert.doesNotMatch(l, BANNED, l);
    }
  }
  assert.ok(n > rows.length * 4);
});

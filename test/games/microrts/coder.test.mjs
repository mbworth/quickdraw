import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assemble } from '../../../src/core/packet.mjs';
import { VOCAB } from '../../../src/games/microrts/abbr.mjs';
import { divisor } from '../../../src/games/microrts/index.mjs';
import { HERE, fixtureFiles, loadFixture, layersAt, snap, triggersOf, SAMPLE_LAST, tiny, tinySnap } from './helpers.mjs';
import { encode } from '../../../src/games/microrts/coder.mjs';

const files = fixtureFiles();
const GOLDEN = path.join(HERE, 'golden');
const PICK = { opening: 1, midgame: Math.ceil(files.length / 2), late: files.length };
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const ORDER = ['header', 'delta', 'triggers', 'production', 'economy', 'army', 'buildings', 'enemy', 'last'];
const PRIO = { header: 0, delta: 0, triggers: 1, production: 0, economy: 1, army: 2, buildings: 2, enemy: 1, last: 0 };

test('goldens: opening, midgame, late (UPDATE_GOLDEN=1 rewrites; review the diff)', { skip: !files.length }, () => {
  fs.mkdirSync(GOLDEN, { recursive: true });
  for (const [name, n] of Object.entries(PICK)) {
    const text = assemble(layersAt(Math.min(n, files.length) - 1), { maxTokens: 600 }).text + '\n';
    const f = path.join(GOLDEN, `${name}.txt`);
    if (UPDATE) fs.writeFileSync(f, text);
    assert.equal(text, fs.readFileSync(f, 'utf8'), `${name} differs; UPDATE_GOLDEN=1 to accept`);
  }
});

test('properties over every fixture', { skip: !files.length }, () => {
  let busiest = 0;
  for (let i = 0; i < files.length; i++) {
    const layers = layersAt(i), fx = loadFixture(files[i]);
    assert.deepEqual(layers.map(l => l.name), ORDER, files[i]);
    for (const l of layers) assert.equal(l.priority, PRIO[l.name], `${files[i]} ${l.name}`);
    const p = assemble(layers, { maxTokens: 100000 });
    assert.doesNotMatch(p.text, /\d\.\d/, `${files[i]}: non-integer`);
    for (const w of p.text.match(/[A-Za-z]+/g) || []) assert.ok(VOCAB.has(w), `${files[i]}: word "${w}" not in ABBR`);
    assert.doesNotMatch(p.text, /#(?!\d)/, `${files[i]}: dangling #`);
    const enemyLines = (layers.find(l => l.name === 'enemy').lines || []);
    const rendered = enemyLines.reduce((n, l) => n + Number(/x(\d+)@/.exec(l.text)[1]), 0);
    const foes = fx.state.units.filter(u => u.player >= 0 && u.player !== fx.state.me).length;
    assert.equal(rendered, foes, `${files[i]}: every enemy rendered once`);
    const b = assemble(layers, { maxTokens: 400, divisor });
    assert.ok(b.estTokens <= 400, `${files[i]}: ${b.estTokens} est tokens`);
    busiest = Math.max(busiest, assemble(layers, { maxTokens: 100000, divisor }).estTokens);
  }
  console.log(`busiest fixture: ${busiest} est tokens untrimmed at divisor ${divisor}`);
});

test('encode is deterministic and pure over the snapshot', { skip: !files.length }, () => {
  const i = files.length - 1;
  assert.equal(JSON.stringify(layersAt(i)), JSON.stringify(layersAt(i)));
});

test('delta reports losses, new units and the resource swing; triggers render', { skip: files.length < 2 }, () => {
  const a = loadFixture(files[0]), b = loadFixture(files[1]);
  const layers = encode({ state: snap(b, 2), prevDecisionState: snap(a, 1), triggers: triggersOf(a, b), lastOrders: SAMPLE_LAST });
  const d = layers.find(l => l.name === 'delta').text;
  assert.match(d, /^D /);
  assert.equal(layers.find(l => l.name === 'last').text, 'L t 20 wk ok; h #22 #16 busy; a #22 13,13 dropped:stale');
});

test('header and priority-0 layers survive any budget', { skip: !files.length }, () => {
  const p = assemble(layersAt(files.length - 1), { maxTokens: 1, divisor });
  for (const n of ['header', 'delta', 'production', 'last']) assert.ok(p.kept.some(k => k.name === n), `${n} dropped`);
});

test('splitStates: a mixed-state cluster splits into one line per state; off by default', () => {
  const W = (id, x, y, st) => ({ id, type: 'Worker', player: 0, x, y, hp: 1, carry: 0, busy: st !== 'idle', st, eta: 0, idleFor: 0 });
  const units = [tiny().units[0], tiny().units[1], W(5, 1, 1, 'harvest'), W(6, 1, 2, 'move')];
  const inp = { state: tinySnap({ units }), prevDecisionState: null, triggers: [], lastOrders: [], pending: [] };
  const armyOf = layers => layers.find(l => l.name === 'army').lines.map(l => l.text);

  assert.deepEqual(armyOf(encode(inp)), ['wk x2@1,2 h #5,#6']);                              // default: one dominant-state line
  assert.deepEqual(armyOf(encode(inp, { splitStates: true })), ['wk x1@1,1 h #5', 'wk x1@1,2 m #6']);
});

test('goalState: a train goal on a worker (building a barracks) reads p, not ?', () => {
  const W = (id, x, y, st, goal) => ({ id, type: 'Worker', player: 0, x, y, hp: 1, carry: 0, busy: st !== 'idle', st, eta: 0, idleFor: 0, goal });
  const units = [tiny().units[0], tiny().units[1], W(5, 1, 1, 'move', 'train'), W(6, 3, 2, 'move', 'harvest')];
  const inp = { state: tinySnap({ units }), prevDecisionState: null, triggers: [], lastOrders: [], pending: [] };
  const armyOf = layers => layers.find(l => l.name === 'army').lines.map(l => l.text);
  assert.deepEqual(armyOf(encode(inp, { splitStates: true, goalState: true })), ['wk x1@1,1 p #5', 'wk x1@3,2 h #6']);
});

test('G and R: the game log buckets logged triggers by 50 cycles with repeats counted; the journal is one line per decision; absent when off', () => {
  const inp = { state: tinySnap(), prevDecisionState: null, triggers: [], lastOrders: [], pending: [] };
  assert.ok(!encode(inp).some(l => l.name === 'log' || l.name === 'recent'));
  const tr = (cls, key, native, gt, count = 1) => ({ cls, key, native, gt, count });
  const log = [tr('info', 'started', { kind: 'started' }, 0), tr('done', '25', { kind: 'done', id: 25, type: 'Worker' }, 52), tr('contact', '0,2', null, 205, 2), tr('contact', '0,2', null, 231), tr('heartbeat', 'hb', null, 233), tr('economy', 'b20', null, 240), tr('loss', '29', { kind: 'lost', id: 29, type: 'Worker' }, 282), tr('info', 'e30', { kind: 'foe', id: 30, type: 'Light', x: 13, y: 12 }, 290)];
  const journal = [{ n: 3, clocks: { cycle: 90 }, triggers: [tr('economy', 'b20', null, 90), tr('done', '25', { kind: 'done', id: 25, type: 'Worker' }, 88)], orders: SAMPLE_LAST }, { n: 4, clocks: { cycle: 105 }, triggers: [tr('heartbeat', 'hb', null, 105)], orders: [] }];
  const layers = encode({ ...inp, log, journal });
  assert.deepEqual(layers.map(l => l.name).slice(-3), ['log', 'recent', 'last']);
  const text = name => layers.find(l => l.name === name).lines.map(l => l.text);
  assert.deepEqual(text('log'), ['t0 started', 't50 done wk#25', 't200 seen at 0,2 x3', 't250 lost wk#29; foe li#30@13,12']);
  assert.deepEqual(text('recent'), ['t90 done wk#25 | t 20 wk ok; h #22 #16 busy; a #22 13,13 dropped:stale', 't105 - | none']);
  const empty = encode({ ...inp, log: [], journal: [] });
  assert.equal(empty.find(l => l.name === 'log').text, 'G none'); assert.equal(empty.find(l => l.name === 'recent').text, 'R none');
  for (const w of [...text('log'), ...text('recent')].join(' ').match(/[A-Za-z]+/g)) assert.ok(VOCAB.has(w), `word "${w}" not in ABBR`);
});

test('G and R trim oldest first under the budget', () => {
  const tr = (gt, id) => ({ cls: 'done', key: String(id), native: { kind: 'done', id, type: 'Worker' }, gt, count: 1 });
  const log = [tr(10, 1), tr(60, 2), tr(110, 3), tr(160, 4)];
  const layers = encode({ state: tinySnap(), prevDecisionState: null, triggers: [], lastOrders: [], pending: [], log });
  const g = layers.find(l => l.name === 'log');
  assert.deepEqual(g.lines.map(l => l.priority), [6, 5, 4, 3]);
  assert.equal(g.priority, 3, 'history drops before army and buildings');
  const trimmed = assemble([g], { maxTokens: assemble([g], { maxTokens: 100000 }).estTokens - 4 });   // the log alone: the army and buildings layers would go first in a whole packet
  const kept = trimmed.text.split('\n').filter(l => /^t\d+ done/.test(l));
  assert.ok(kept.length >= 1 && kept.length < 4, `trimmed some: ${kept.length}`);
  assert.deepEqual(kept, ['t0 done wk#1', 't50 done wk#2', 't100 done wk#3', 't150 done wk#4'].slice(-kept.length), 'newest survive');
});

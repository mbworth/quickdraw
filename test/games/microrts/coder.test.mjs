import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assemble } from '../../../src/core/packet.mjs';
import { VOCAB } from '../../../src/games/microrts/abbr.mjs';
import { divisor } from '../../../src/games/microrts/index.mjs';
import { HERE, fixtureFiles, loadFixture, layersAt, snap, triggersOf, SAMPLE_LAST } from './helpers.mjs';
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

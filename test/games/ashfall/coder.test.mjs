import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assemble } from '../../../src/core/packet.mjs';
import { VOCAB } from '../../../src/games/ashfall/abbr.mjs';
import { HERE, fixtureFiles, loadFixture, layersAt } from './helpers.mjs';
import { divisor } from '../../../src/games/ashfall/index.mjs';

const files = fixtureFiles();
const GOLDEN = path.join(HERE, 'golden');
const PICK = { opening: 1, firefight: 42, late: files.length };   // 1-based fixture numbers
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const ORDER = ['header', 'delta', 'triggers', 'production', 'economy', 'army', 'buildings', 'enemy', 'remembered', 'fields', 'last'];
const PRIO = { header: 0, delta: 0, triggers: 1, production: 0, economy: 1, army: 2, buildings: 2, enemy: 1, remembered: 3, fields: 3, last: 0 };

test('goldens: opening, firefight, late (UPDATE_GOLDEN=1 rewrites; review the diff)', { skip: !files.length }, () => {
  fs.mkdirSync(GOLDEN, { recursive: true });
  for (const [name, n] of Object.entries(PICK)) {
    const i = Math.min(n, files.length) - 1;
    const text = assemble(layersAt(i), { maxTokens: 600 }).text + '\n';
    const f = path.join(GOLDEN, `${name}.txt`);
    if (UPDATE) fs.writeFileSync(f, text);
    assert.equal(text, fs.readFileSync(f, 'utf8'), `${name} differs (fixture ${files[i]}); UPDATE_GOLDEN=1 to accept`);
  }
});

test('properties over every fixture', { skip: !files.length }, () => {
  let busiest = 0;
  for (let i = 0; i < files.length; i++) {
    const layers = layersAt(i);
    const fx = loadFixture(files[i]);
    assert.deepEqual(layers.map(l => l.name), ORDER, files[i]);
    for (const l of layers) assert.equal(l.priority, PRIO[l.name], `${files[i]} ${l.name}`);
    assert.ok(layers.filter(l => l.full).every(l => l.name === 'remembered' || l.name === 'fields'));
    const p = assemble(layers, { maxTokens: 100000 });
    assert.doesNotMatch(p.text, /\d\.\d/, `${files[i]}: non-integer`);
    for (const word of p.text.match(/[A-Za-zΔ]+/g) || []) assert.ok(VOCAB.has(word), `${files[i]}: word "${word}" not in ABBR`);
    for (const m of p.text.matchAll(/(.)#(\d+)/g)) assert.ok(/[a-z,\s]/.test(m[1]), `${files[i]}: raw id "${m[0]}"`);
    assert.doesNotMatch(p.text, /#(?!\d)/, `${files[i]}: dangling #`);
    const enemyLayer = layers.find(l => l.name === 'enemy');
    const rendered = (enemyLayer.lines || []).reduce((n, l) => n + Number(/x(\d+)@/.exec(l.text)[1]), 0);
    assert.equal(rendered, fx.state.enemyVisible.length, `${files[i]}: every visible enemy rendered once`);
    const budgeted = assemble(layers, { maxTokens: 600, divisor });
    assert.ok(budgeted.estTokens <= 600, `${files[i]}: ${budgeted.estTokens} est tokens at divisor ${divisor}`);
    assert.ok(budgeted.kept.some(k => k.name === 'army') && budgeted.kept.some(k => k.name === 'enemy'), `${files[i]}: army/enemy layers must survive a 600 budget (dropped ${JSON.stringify(budgeted.dropped)})`);
    busiest = Math.max(busiest, assemble(layers, { maxTokens: 100000, divisor }).estTokens);
  }
  console.log(`busiest fixture: ${busiest} est tokens untrimmed at divisor ${divisor}`);
});

test('encode is deterministic', { skip: !files.length }, () => {
  const i = files.length - 1;
  assert.equal(JSON.stringify(layersAt(i)), JSON.stringify(layersAt(i)));
});

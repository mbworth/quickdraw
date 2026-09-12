import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assemble } from '../../../src/core/packet.mjs';
import { VOCAB } from '../../../src/games/ashfall/abbr.mjs';
import { HERE, fixtureFiles, loadFixture, layersAt, snap } from './helpers.mjs';
import { encode } from '../../../src/games/ashfall/coder.mjs';
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

test('foldFields collapses unexplored fields into one line; fullBuildings marks the layer full', { skip: !files.length }, () => {
  const i = Math.min(PICK.firefight, files.length) - 1;
  const base = layersAt(i), folded = layersAt(i, files, { foldFields: true, fullBuildings: true });
  const F = L => L.find(l => l.name === 'fields'), B = L => L.find(l => l.name === 'buildings');
  const unexplored = F(base).lines.filter(l => / \?$/.test(l.text));
  assert.ok(unexplored.length >= 2, 'fixture has unexplored fields');
  assert.equal(F(folded).lines.length, F(base).lines.length - unexplored.length + 1);
  const fold = F(folded).lines.at(-1).text;
  assert.match(fold, /^f\? (f\d+c?@-?\d+,-?\d+ ?)+$/);
  for (const l of unexplored) { const m = l.text.match(/^(f\d+) \w+ (\w+)@(-?\d+,-?\d+)/); assert.ok(fold.includes(`${m[1]}${m[2] === 'cry' ? 'c' : ''}@${m[3]}`), l.text); }
  assert.equal(F(folded).lines.filter(l => !l.text.startsWith('f? ')).length, F(base).lines.length - unexplored.length, 'explored lines untouched');
  assert.equal(B(base).full, undefined); assert.equal(B(folded).full, true);
  assert.equal(assemble(folded, { maxTokens: 9999, fullEvery: 5, n: 2 }).text.includes('\nB'), false, 'buildings dropped off-cadence');
  assert.ok(assemble(folded, { maxTokens: 9999, fullEvery: 5, n: 6 }).text.includes('\nB'), 'buildings back on the full packet');
});

test('fieldsOnDemand keeps fields on every packet while a harvester is idle or a worked field is dry', { skip: !files.length }, () => {
  const fx = loadFixture(files[Math.min(PICK.firefight, files.length) - 1]);
  const F = (native, o) => encode({ state: snap({ state: native }), triggers: [], lastOrders: [] }, o).find(l => l.name === 'fields');
  const base = fx.state;
  assert.equal(F(base, { fieldsOnDemand: true }).full, true, 'busy harvesters: fields stay on the full cadence');
  const wk = base.mine.find(u => u.type === 'worker');
  const idle = { ...base, mine: base.mine.map(u => (u === wk ? { ...u, state: 'idle' } : u)) };
  assert.equal(F(idle, {}).full, true); assert.equal(F(idle, { fieldsOnDemand: true }).full, undefined);
  assert.ok(assemble(encode({ state: snap({ state: idle }), triggers: [], lastOrders: [] }, { fieldsOnDemand: true }), { maxTokens: 9999, fullEvery: 5, n: 2 }).text.includes('\nF\n'));
  const worked = base.fields.find(f => base.mine.some(u => u.type === 'worker' && u.state === 'gather' && Math.hypot(u.x - f.x, u.z - f.z) <= 14));
  assert.ok(worked, 'a fixture field with harvesters on it');
  const dry = { ...base, fields: base.fields.map(f => (f === worked ? { ...f, ore: 0 } : f)) };
  assert.equal(F(dry, { fieldsOnDemand: true }).full, undefined);
});

test('keepAnchor: core and turret lines stay on slim packets, other buildings ride the cadence', { skip: !files.length }, () => {
  const i = Math.min(PICK.late, files.length) - 1;
  const L = layersAt(i, files, { fullBuildings: true, keepAnchor: true });
  const B = L.find(l => l.name === 'buildings'), rest = L.find(l => l.name === 'buildings-rest');
  assert.ok(B.lines.every(l => /^(co|tu)#/.test(l.text)) && B.lines.length >= 1, 'anchor lines only');
  assert.ok(rest.full && rest.lines.length >= 1 && rest.lines.every(l => !/^(co|tu)#/.test(l.text)));
  const slim = assemble(L, { maxTokens: 9999, fullEvery: 5, n: 2 }).text, full = assemble(L, { maxTokens: 9999, fullEvery: 5, n: 6 }).text;
  assert.ok(slim.includes('\nB\nco#') && !rest.lines.some(l => slim.includes(l.text)), 'slim: B holds the anchor only');
  assert.equal(full, assemble(layersAt(i, files, { fullBuildings: true }), { maxTokens: 9999, fullEvery: 5, n: 6 }).text, 'full packet unchanged');
  assert.equal(layersAt(i, files, { keepRemembered: true }).find(l => l.name === 'remembered').full, undefined, 'keepRemembered takes M off the cadence');
});

test('compactBuildings: one always-on B line with ids, anchor positions, and only hurt or unfinished detail', { skip: !files.length }, () => {
  const i = Math.min(PICK.late, files.length) - 1;
  const B = layersAt(i, files, { compactBuildings: true }).find(l => l.name === 'buildings');
  assert.equal(B.lines, undefined); assert.equal(B.full, undefined);
  assert.match(B.text, /^B co#\d+@-?\d+,-?\d+( (ba|dp|tu|wl|ar|se|co)#\d+(@-?\d+,-?\d+)?( (hp\d+|bld\d+))?)*$/);
  const n = layersAt(i, files, {}).find(l => l.name === 'buildings').lines.length;
  assert.equal(B.text.split(' ').filter(w => /#\d+/.test(w)).length, n, 'every building named once');
  assert.ok(assemble(layersAt(i, files, { compactBuildings: true }), { maxTokens: 9999, fullEvery: 5, n: 2 }).text.includes('\nB co#'), 'present on slim packets');
});

test('keepRemembered puts the remembered layer on every packet at army priority, so a one-line M is not budget-dropped behind fields', async () => {
  const { assemble } = await import('../../../src/core/packet.mjs');
  const fx = JSON.parse(fs.readFileSync(path.join(HERE, 'bench/fixtures/core-t422.json'), 'utf8'));
  fx.state.enemyBuildingsRemembered = [{ id: 20027, type: 'barracks', x: 22, z: 49, hp: 1, max: 650, lastSeen: fx.state.time - 64 }];
  const input = { state: snap(fx), prevDecisionState: null, triggers: [], lastOrders: [] };
  const keep = encode(input, { foldFields: true, compactBuildings: true, keepRemembered: true });
  const rem = keep.find(l => l.name === 'remembered');
  assert.equal(rem.priority, 2); assert.equal(rem.full, undefined);
  const slim = assemble(keep, { maxTokens: 260, divisor: 1.34, fullEvery: 5, n: 3 });   // tight enough to cut army and buildings
  assert.ok(slim.text.includes('\nM\nba#20027@22,49'), 'kept on a slim packet under a tight budget');
  const drop = encode(input, { foldFields: true, compactBuildings: true });
  assert.equal(drop.find(l => l.name === 'remembered').priority, 3);
  assert.ok(!assemble(drop, { maxTokens: 260, divisor: 1.34, fullEvery: 5, n: 3 }).text.includes('\nM\n'), 'slim-dropped without the flag');
});

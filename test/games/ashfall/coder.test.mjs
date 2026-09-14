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

test('searchFields: M names the search waypoint while 8+ riflemen have no enemy building listed; f? in the same order; fields cadence untouched', () => {
  const fx = JSON.parse(fs.readFileSync(new URL('./bench/fixtures/search-t345.json', import.meta.url), 'utf8'));
  const L = (native, o, name) => encode({ state: snap({ state: native }), triggers: [], lastOrders: [] }, { foldFields: true, fieldsOnDemand: true, keepRemembered: true, ...o }).find(l => l.name === name);
  const s = fx.state;
  assert.equal(L(s, {}, 'remembered').text, 'M none', 'off by default');
  assert.equal(L(s, { searchFields: true }, 'remembered').lines.map(l => l.text).join(), 'search f5@78,13', 'the unexplored field nearest the mirror of my core');
  const few = { ...s, mine: s.mine.filter(u => u.type !== 'trooper').concat(s.mine.filter(u => u.type === 'trooper').slice(0, 7)) };
  assert.equal(L(few, { searchFields: true }, 'remembered').text, 'M none', 'under 8 riflemen: nothing to search with');
  const known = { ...s, enemyBuildingsRemembered: [{ id: 20008, type: 'depot', x: 30, z: 60, hp: 1, max: 1, lastSeen: s.time }] };
  assert.match(L(known, { searchFields: true }, 'remembered').lines[0].text, /^dp#20008@30,60/, 'a listed building replaces the waypoint');
  const seenVis = { ...s, enemyVisible: [{ id: 20001, type: 'core', x: 30, z: 60, hp: 1, max: 1 }] };
  assert.equal(L(seenVis, { searchFields: true }, 'remembered').text, 'M none', 'a visible building: no waypoint (X carries it)');
  const explored = { ...s, fields: s.fields.map(f => (f.ore == null ? { ...f, ore: 500, seen: true } : f)) };
  assert.equal(L(explored, { searchFields: true }, 'remembered').lines[0].text, 'search @28,64', 'every field explored: the mirror of my core is the last waypoint');
  const raiders = { ...s, mine: s.mine.map(u => (u.type === 'trooper' ? { ...u, type: 'raider' } : u)) };
  assert.equal(L(raiders, { searchFields: true }, 'remembered').lines[0].text, 'search f5@78,13', 'any combat unit counts toward the 8');
  const cry = { ...s, fields: s.fields.map(f => (f.res === 'crystal' ? f : f.ore == null ? { ...f, ore: 500, seen: true } : f)) };
  assert.equal(L(cry, { searchFields: true }, 'remembered').lines[0].text, 'search @28,64', 'crystal pockets are never the waypoint');
  const noDry = st => ({ ...st, fields: st.fields.map(f => (f.ore === 0 ? { ...f, ore: 100 } : f)) });
  assert.equal(L(noDry(s), { searchFields: true }, 'fields').full, true, 'fields keep their cadence');
  assert.equal(L(s, { searchFields: true }, 'fields').lines.map(l => l.text).find(l => l.startsWith('f? ')), 'f? f5@78,13 f3@-43,73 f8@-45,32 f7@-79,25 f10@25,-80 f9@75,-77 f13c@-46,-1 f12c@20,-48');
  assert.equal(L(s, {}, 'fields').lines.map(l => l.text).find(l => l.startsWith('f? ')), 'f? f3@-43,73 f5@78,13 f7@-79,25 f8@-45,32 f9@75,-77 f10@25,-80 f12c@20,-48 f13c@-46,-1', 'default order is by id');
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

test('pending calls in flight are told on the L line, by their triggers', () => {
  const fx = loadFixture(fixtureFiles()[3]);
  const pending = [[{ cls: 'danger', key: 'dmg', native: { kind: 'attacked', id: 19, hp: 48, byType: 'trooper' } }]];
  const L = encode({ state: snap(fx), prevDecisionState: null, triggers: [], lastOrders: [], pending }).find(l => l.name === 'last').text;
  assert.ok(L.startsWith('L none; pending: '), L);
  assert.ok(!encode({ state: snap(fx), prevDecisionState: null, triggers: [], lastOrders: [] }).find(l => l.name === 'last').text.includes('pending'));
});

test('guide (game38): counts on H, post and yard on the compact B line, the search waypoint mirror-first', () => {
  const fx = JSON.parse(fs.readFileSync(new URL('./bench/fixtures/search-t345.json', import.meta.url), 'utf8'));
  const L = (native, o, name) => encode({ state: snap({ state: native }), triggers: [], lastOrders: [] }, { foldFields: true, compactBuildings: true, keepRemembered: true, searchFields: true, ...o }).find(l => l.name === name);
  const s = fx.state;
  assert.ok(!/ wk\d+ tr\d+/.test(L(s, {}, 'header').text) && !L(s, {}, 'buildings').text.includes('post@'), 'off by default: packet byte-identical');
  const wk = s.mine.filter(u => u.type === 'worker').length, tr = s.mine.filter(u => u.type === 'trooper').length;
  assert.match(L(s, { guide: true }, 'header').text, new RegExp(`^H t\\d+:\\d\\d o\\d+ c\\d+ s\\d+/\\d+ wk${wk} tr${tr}`));
  const B = L(s, { guide: true }, 'buildings').text;
  const m = B.match(/^B co#\d+@(-?\d+),(-?\d+) post@(-?\d+),(-?\d+) yard@(-?\d+),(-?\d+) /).slice(1).map(Number);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  assert.ok(Math.abs(d([m[2], m[3]], [m[0], m[1]]) - 8) < 1.5 && d([m[2], m[3]], [0, 0]) < d([m[0], m[1]], [0, 0]), 'post: 8 from the core toward the centre');
  assert.ok(Math.abs(d([m[4], m[5]], [m[0], m[1]]) - 12) < 1.5 && d([m[4], m[5]], [0, 0]) > d([m[0], m[1]], [0, 0]), 'yard: 12 from the core away from the centre');
  assert.equal(L(s, { guide: true }, 'remembered').lines[0].text, 'search @28,64', 'the mirror first, unexplored fields or not');
  const there = { ...s, mine: s.mine.map(u => (u.type === 'trooper' ? { ...u, x: 30, z: 60 } : u)) };
  assert.equal(L(there, { guide: true }, 'remembered').lines[0].text, 'search f5@78,13', 'standing at the mirror with nothing listed: the nearest unexplored ore field');
  assert.equal(L(s, {}, 'remembered').lines[0].text, 'search f5@78,13', 'without guide the field comes first, as recorded in games 34-37');
  assert.ok(!B.includes('(no tu)') && L({ ...s, mine: s.mine.filter(u => u.type !== 'turret') }, { guide: true }, 'buildings').text.endsWith(' (no tu)'), '(no tu) only while no turret exists');
  const A = L(s, { guide: true }, 'army').lines.map(l => l.text);
  assert.ok(A.some(l => /^tr x\d+@.* out$/.test(l)) && !A.some(l => /^wk .* out$/.test(l)), 'rifleman clusters far from home are marked out, harvesters never');
  assert.ok(!L(s, {}, 'army').lines.some(l => / out$/.test(l.text)), 'off by default');
  assert.match(L(s, { guide: true }, 'production').text, /r-2,0 out/, 'a rally more than 30 from home is marked out');
  const home = { ...s, mine: s.mine.map(b => (b.rally ? { ...b, rally: { x: s.myBase.x + 5, z: s.myBase.z } } : b)) };
  assert.ok(!/ out/.test(L(home, { guide: true }, 'production').text), 'a rally at home is not');
  const hb = [{ cls: 'heartbeat', key: 'hb', t: 0, count: 1 }], T = (o, tr) => encode({ state: snap({ state: s }), triggers: tr, lastOrders: [] }, o).find(l => l.name === 'triggers').text;
  assert.equal(T({ guide: true }, hb), 'T none', 'guide: a heartbeat is not an event');
  assert.equal(T({}, hb), 'T hb'); assert.match(T({ guide: true }, [...hb, { cls: 'economy', key: 'oreturret', t: 0, count: 1 }]), /^T ore turret$/);
});

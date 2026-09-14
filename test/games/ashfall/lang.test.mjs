import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolLang, decode, parseOne, encodeOrder } from '../../../src/games/ashfall/lang.mjs';
import { expand } from '../../../src/games/ashfall/expand.mjs';
import { createModel } from '../../../src/core/model.mjs';
import { virtualClock } from '../../../src/core/clock.mjs';
import { snap } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('every verb decodes to the order object the JSON tool would have carried', () => {
  const cases = [
    ['t 10006 tr 3', { cmd: 'train', building: 10006, type: 'trooper', count: 3 }],
    ['t ba#10006 trooper', { cmd: 'train', building: 10006, type: 'trooper', count: 1 }],
    ['b tu 62,-4', { cmd: 'build', workers: ['workers'], type: 'turret', x: 62, z: -4 }],
    ['b depot -70,4 idle', { cmd: 'build', workers: ['idle'], type: 'depot', x: -70, z: 4 }],
    ['m army 65,25', { cmd: 'move', units: ['army'], x: 65, z: 25, attackMove: false }],
    ['am army 65,25', { cmd: 'move', units: ['army'], x: 65, z: 25, attackMove: true }],
    ['m 10022,10023 65,25 a', { cmd: 'move', units: ['10022', '10023'], x: 65, z: 25, attackMove: true }],
    ['am tr x5@74,-8 58,1', { cmd: 'move', units: ['tr x5@74,-8'], x: 58, z: 1, attackMove: true }],
    ['am tr x5@74,-8 a 58,1', { cmd: 'move', units: ['tr x5@74,-8'], x: 58, z: 1, attackMove: true }],
    ['a tr x5@65,-7 10', { cmd: 'attack', units: ['tr x5@65,-7'], target: 10 }],
    ['s army', { cmd: 'stop', units: ['army'] }],
    ['d 10040', { cmd: 'disband', units: ['10040'] }],
    ['g idle 11', { cmd: 'gather', units: ['idle'], ore: 11 }],
    ['g idle n#11', { cmd: 'gather', units: ['idle'], ore: 11 }],
    ['g 10009', { cmd: 'gather', units: ['10009'], ore: null }],
    ['r idle 10030', { cmd: 'repair', units: ['idle'], target: 10030 }],
    ['rs 10050 w', { cmd: 'research', building: 10050, key: 'weapons' }],
    ['ry 10006 74,-8', { cmd: 'rally', building: 10006, x: 74, z: -8 }],
    ['ry 10006 -', { cmd: 'rally', building: 10006, x: null, z: null }],
    ['c 10012', { cmd: 'cancel', building: 10012 }],
    ['train 10006 tr 2', { cmd: 'train', building: 10006, type: 'trooper', count: 2 }],
    // shapes the model wrote on the first lang bench: arguments glued on with commas, a label inside a list, a type code as a selector
    ['am tr x11@46,34,49,50', { cmd: 'move', units: ['tr x11@46,34'], x: 49, z: 50, attackMove: true }],
    ['r idle,tr x12@64,24,33', { cmd: 'repair', units: ['idle', 'tr x12@64,24'], target: 33 }],
    ['am tr,army 65,25', { cmd: 'move', units: ['troopers', 'army'], x: 65, z: 25, attackMove: true }],
    ['am army f5@78,13', { cmd: 'move', units: ['army'], x: 78, z: 13, attackMove: true }],   // a field token pasted from M or F is a position
    ['am army 65, 25', { cmd: 'move', units: ['army'], x: 65, z: 25, attackMove: true }],   // a space inside the coordinate
    ['am all army 65,25', { cmd: 'move', units: ['army'], x: 65, z: 25, attackMove: true }],   // never the harvesters
    ['am ARMY 65,25', { cmd: 'move', units: ['army'], x: 65, z: 25, attackMove: true }],
    ['am tr x11@46,34 a 49,50', { cmd: 'move', units: ['tr x11@46,34'], x: 49, z: 50, attackMove: true }],
  ];
  for (const [text, want] of cases) assert.deepEqual(parseOne(text), want, text);
  for (const bad of ['t tr 3', 'b tu', 'm army', 'a army', 'x 1', 'rs 10050 lasers', 'ry 10006 there']) assert.deepEqual(parseOne(bad), { cmd: '?', text: bad }, bad);
});

test('decode splits on ";", ignores empty and "-", and act follows the order count', () => {
  assert.deepEqual(decode({ o: '' }), { act: false, orders: [], note: null });
  assert.deepEqual(decode({ o: ' - ' }), { act: false, orders: [], note: null });
  assert.deepEqual(decode({}), { act: false, orders: [], note: null });
  const d = decode({ o: 't 10006 tr 3; am army 65,25;' });
  assert.equal(d.act, true); assert.deepEqual(d.orders.map(o => o.cmd), ['train', 'move']);
  assert.deepEqual(decode({ o: 'nonsense here' }).orders, [{ cmd: '?', text: 'nonsense here' }]);
  const tag = '<' + '/antml:parameter>';   // the closing tag the model leaked in game 25, spelled so this file does not carry it verbatim
  assert.deepEqual(decode({ o: 't 12 tr 2;' + tag }).orders.map(o => o.cmd), ['train'], 'a leaked tool-call tag is not an order');
  assert.equal(decode({ o: tag }).act, false);
});

test('a bad line is one dropped order, the rest of the batch goes through expand', () => {
  const s = snap(JSON.parse(fs.readFileSync(path.join(ROOT, 'test/games/ashfall/bench/fixtures/push-t143.json'), 'utf8')));
  const bar = s.native.mine.find(e => e.type === 'barracks');
  const { cmds, dropped } = expand(decode({ o: `t ${bar.id} tr 2; fly away; s army` }).orders, s);
  assert.deepEqual(cmds.map(c => c.cmd), ['train', 'train', 'stop']);
  assert.deepEqual(dropped, [{ cmd: { cmd: '?', text: 'fly away' }, reason: 'bad-cmd' }]);
  assert.deepEqual(cmds[0], { cmd: 'train', building: bar.id, type: 'trooper' });
});

test('encodeOrder round-trips through parseOne', () => {
  for (const o of [{ cmd: 'train', building: 10006, type: 'trooper', count: 3 }, { cmd: 'build', workers: ['workers'], type: 'turret', x: 62, z: -4 }, { cmd: 'move', units: ['army'], x: 65, z: 25, attackMove: true }, { cmd: 'attack', units: ['tr x5@65,-7'], target: 10 }, { cmd: 'gather', units: ['idle'], ore: 11 }, { cmd: 'rally', building: 10006, x: null, z: null }, { cmd: 'research', building: 1, key: 'optics' }]) assert.deepEqual(parseOne(encodeOrder(o)), o, encodeOrder(o));
});

test('the lang tool is strict, and --ashfall-lang wires it with decode', async () => {
  assert.deepEqual(toolLang.required, ['o']); assert.equal(toolLang.additionalProperties, false); assert.ok(Object.isFrozen(toolLang));
  const { createAdapter } = await import('../../../src/games/ashfall/index.mjs');
  const a = createAdapter({}, { clock: virtualClock(0), lang: true, noNote: true, WS: class { close() {} } });
  assert.equal(a.tool, toolLang); assert.equal(a.decode, decode);
  const b = createAdapter({}, { clock: virtualClock(0), WS: class { close() {} } });
  assert.equal(b.decode, undefined);
});

test('createModel applies the adapter decode and records the tool input as written', async () => {
  const client = { messages: { create: async () => ({ model: 'm', stop_reason: 'tool_use', usage: { output_tokens: 9 }, content: [{ type: 'tool_use', name: 'orders', input: { o: 't 10006 tr 3' } }] }) } };
  const callModel = createModel({ client, model: 'm', system: 'S', tool: toolLang, toolName: 'orders', toolDescription: 'd', clock: virtualClock(0), warn: () => {}, decode });
  const res = await callModel({ packet: 'H' });
  assert.equal(res.stop, 'tool_use'); assert.equal(res.act, true);
  assert.deepEqual(res.orders, [{ cmd: 'train', building: 10006, type: 'trooper', count: 3 }]);
  assert.deepEqual(res.raw.content[0].input, { o: 't 10006 tr 3' });
});

test('game25 prompt: strategy sections byte-identical to game15, only the format section differs', () => {
  const read = f => fs.readFileSync(path.join(ROOT, 'prompts/ashfall', f), 'utf8');
  const from = (s, h) => s.slice(s.indexOf(h));
  const a = read('game15-sonnet.md'), b = read('game25-sonnet.md');
  assert.equal(from(a, '## Play'), from(b, '## Play'));
  assert.equal(a.slice(0, a.indexOf('## The packet')), b.slice(0, b.indexOf('## The packet')));
  assert.ok(b.includes('`t <building> <type> [n]`') && !b.includes('"12"'));
});

test('game29 prompt (--reply text): strategy and packet sections byte-identical to game25, only the answer format differs', () => {
  const read = f => fs.readFileSync(path.join(ROOT, 'prompts/ashfall', f), 'utf8');
  const from = (s, h) => s.slice(s.indexOf(h));
  const a = read('game25-sonnet.md'), b = read('game29-sonnet.md');
  assert.equal(from(a, '## Play'), from(b, '## Play'));
  assert.equal(a.slice(a.indexOf('## The packet'), a.indexOf('## The tool')), b.slice(b.indexOf('## The packet'), b.indexOf('## Your answer')));
  assert.ok(b.includes('`-` alone when nothing is worth ordering') && !b.includes('tool call'));
});

test('decode strips a code fence or backticks around a text reply', () => {
  assert.deepEqual(decode({ o: '```\nt 12 tr 3\n```' }).orders, [{ cmd: 'train', building: 12, type: 'trooper', count: 3 }]);
  assert.deepEqual(decode({ o: '`-`' }), { act: false, orders: [], note: null });
});

test('game32 prompt: game25 with rule 3 rewritten (M names the search waypoint, no example coordinate), the M description extended and the `am` example dropped; all else byte-identical', () => {
  const read = f => fs.readFileSync(path.join(ROOT, 'prompts/ashfall', f), 'utf8');
  const a = read('game25-sonnet.md').split('\n'), b = read('game32-sonnet.md').split('\n');
  assert.equal(a.length, b.length);
  const diff = a.map((l, i) => (l === b[i] ? null : i)).filter(i => i != null);
  assert.deepEqual(diff.map(i => a[i].slice(0, 12)), ['- `M` rememb', '- `m <units>', '3. **Win by ']);
  assert.ok(!/65,25|-65,-25|mirror/.test(b.join('\n')), 'no example coordinate and no mirror rule');
  assert.ok(b[diff[2]].includes('the push itself is the search') && b[diff[2]].includes('`search fN@x,z`') && b[diff[2]].includes('never guessed or copied'));
  for (const i of diff) assert.ok(!/\d+,-?\d+/.test(b[i]) || /`b tu 62,-4`/.test(b[i]), `changed line ${i + 1} carries no coordinate`);   // the build example is syntax, not a target
});

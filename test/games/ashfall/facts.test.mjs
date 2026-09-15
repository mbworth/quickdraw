// facts.mjs is the state side of the fidelity oracle: the full state view, built from the state with no packet.
// The invariant: against the unbudgeted full-layer encoder config (`full: true`) the two readers agree layer for layer.
// What the packet's shaping folds away and what its budget drops are the gaps bin/oracle.mjs measures; the last two tests
// prove it measures something (drop F and the gather order changes; put a fighting rifleman in an idle cluster and the
// packet never learns).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from '../../../src/games/ashfall/coder.mjs';
import { factsOf } from '../../../src/games/ashfall/facts.mjs';
import { read } from '../../../src/games/ashfall/read.mjs';
import { decideFacts } from '../../../src/games/ashfall/policy/game38.mjs';
import { assemble } from '../../../src/core/packet.mjs';
import { loadCases } from '../../../bin/bench.mjs';
import { oracleRun } from '../../../bin/oracle.mjs';
import { HERE, fixtureFiles, loadFixture, snap, triggersOf, SAMPLE_LAST } from './helpers.mjs';

const ROOT = path.resolve(HERE, '../../..');
const WORKING = { foldFields: true, fieldsOnDemand: true, compactBuildings: true, keepRemembered: true, searchFields: true, guide: true, planMarks: true };
const KEYS = ['h', 'd', 't', 'p', 'e', 'a', 'b', 'x', 'm', 'f', 'l', 'layers'];
const HB = [{ cls: 'heartbeat', key: 'hb', t: 0 }];
const unbudgeted = (inputs, opts) => assemble(encode(inputs, { ...opts, full: true }), { maxTokens: 1e6, divisor: 3.5, fullEvery: 0, n: 2 });
const packetOf = (inputs, opts) => read(assemble(encode(inputs, opts), { maxTokens: 1e6, divisor: 3.5, fullEvery: 0, n: 2 }).text);

function allInputs() {
  const files = fixtureFiles();
  const out = files.map((f, i) => {
    const fx = loadFixture(f), prev = i > 0 ? loadFixture(files[i - 1]) : null;
    return [f, { state: snap(fx, i + 1), prevDecisionState: prev && snap(prev, i), triggers: triggersOf(fx), lastOrders: i > 0 ? SAMPLE_LAST : [], pending: [] }];
  });
  return out;
}

test('unbudgeted, the packet reader and the state reader agree on every layer of every fixture', async () => {
  const cases = await loadCases('ashfall');
  const inputs = [...allInputs(), ...cases.map(c => [c.id, { state: snap(c.fx, 1), prevDecisionState: null, triggers: HB, lastOrders: [], pending: [] }])];
  assert.ok(inputs.length > 20);
  for (const [id, inp] of inputs) {
    const k = read(unbudgeted(inp, WORKING).text), s = factsOf(inp, WORKING);
    for (const key of KEYS) assert.deepStrictEqual(s[key], k[key], `${id}: ${key}`);
    assert.deepEqual(decideFacts(s), decideFacts(k), `${id}: decision`);
  }
});

// The same agreement under the encoder's other shapes: no guide, the full B layer, anchors split out, fields unfolded.
test('the invariant holds for every packet shape the encoder writes', async () => {
  for (const opts of [{}, { foldFields: true, searchFields: true }, { fullBuildings: true, keepAnchor: true, guide: true }, { compactBuildings: true, guide: true }]) {
    for (const [id, inp] of allInputs()) {
      const k = read(unbudgeted(inp, opts).text), s = factsOf(inp, opts);
      for (const key of KEYS) assert.deepStrictEqual(s[key], k[key], `${id}: ${key} ${JSON.stringify(opts)}`);
    }
  }
});

const RUN = path.join(ROOT, 'runs/ashfall-60.jsonl');   // a script game on the working config: every packet reads
test('the oracle runs over a recording and reports its shape', { skip: !fs.existsSync(RUN) }, async () => {
  const r = await oracleRun(RUN, { every: 20 });
  const s = r.summary;
  assert.equal(r.game, 'ashfall');
  assert.ok(s.decisions > 5 && s.decided === s.decisions);
  assert.deepEqual([s.errors.packet, s.errors.state], [0, 0], s.errors.firstPacket || s.errors.firstState || '');
  assert.equal(s.exactPct, Math.round((100 * s.exact) / s.decided));
  assert.ok(s.samePct >= s.exactPct && s.samePct <= 100);
  for (const k of Object.keys(s.layerDiff)) assert.ok(KEYS.includes(k));
  assert.equal(Object.keys(s.attribution).every(k => KEYS.includes(k)), true);
});

// v3 sanity gate: --arm re-encodes the packet instead of reading it, so an arm with no overrides must reproduce the
// recorded packet byte for byte and therefore the non-arm summary exactly. Without this every ablation is unanchored.
test('--arm with no overrides reproduces the non-arm numbers exactly', { skip: !fs.existsSync(RUN) }, async () => {
  const plain = await oracleRun(RUN, { every: 7 });
  const armed = await oracleRun(RUN, { every: 7, arm: [] });
  assert.deepStrictEqual(armed.summary, plain.summary);
  assert.deepStrictEqual(armed.rows, plain.rows);
});

test('the gap is real: drop F from the packet and the gather order loses its node id', async () => {
  const c = (await loadCases('ashfall')).find(x => x.id === 'dry');
  const inp = { state: snap(c.fx, 1), prevDecisionState: null, triggers: HB, lastOrders: [], pending: [] };
  const opts = { ...WORKING, fieldsOnDemand: false };   // F back on the --full-every cadence, so this packet is without it
  const slim = assemble(encode(inp, opts), { maxTokens: 1e6, divisor: 3.5, fullEvery: 5, n: 2 });
  const k = read(slim.text), s = factsOf(inp, opts);
  assert.equal(k.layers.has('F'), false);
  assert.notDeepStrictEqual(k.f, s.f);
  assert.equal(decideFacts(k).o.includes('g idle;') || decideFacts(k).o.endsWith('g idle'), true);
  assert.match(decideFacts(s).o, /g idle \d+/);
});

// v3: X folds the way A does — a cluster's centroid stands in for every enemy in it, and three enemies read as one line
// whose cell is none of theirs. The state view keeps each, with its own cell, id and dB/dA.
test('X unfolds on the state side: the packet merges enemies the state keeps apart', () => {
  const file = fixtureFiles().find(f => f.startsWith('031-'));
  const fx = loadFixture(file);
  const inp = { state: snap(fx, 1), prevDecisionState: null, triggers: triggersOf(fx), lastOrders: [], pending: [] };
  const k = packetOf(inp, WORKING), s = factsOf(inp, WORKING);
  assert.equal(k.x.length, 1);
  assert.equal(s.x.length, 3);
  assert.ok(s.x.every(c => c.n === 1 && c.ids.length === 1));                      // ids always listed
  assert.equal(new Set(s.x.map(c => `${c.x},${c.z}`)).size, 3);                    // three cells, not one centroid
  assert.ok(s.x.some(c => c.dB !== k.x[0].dB || c.dA !== k.x[0].dA));              // per-unit dB/dA, not the cluster's
});

// v1 could not see this: an A cluster carries one state for every unit in it, so a rifleman that is already fighting
// reads as idle and the order sends it out again. The packet's decision does not move when that unit changes state;
// the full state view's does.
test('one cluster, two states: the packet keeps the majority state and never sees the change', () => {
  const file = fixtureFiles().find(f => f.startsWith('032-'));   // five riflemen at the post, one A line, `tr x5@39,1 i`
  const load = () => { const fx = loadFixture(file); return { fx, inp: { state: snap(fx, 1), prevDecisionState: null, triggers: triggersOf(fx), lastOrders: [], pending: [] } }; };
  const before = load(), after = load();
  const at = after.fx.state.mine.find(e => e.type === 'trooper' && Math.round(e.x) === 39 && Math.round(e.z) === 1);
  assert.ok(at && at.state === 'idle');
  at.state = 'attack';
  const near = (u, p) => Math.hypot(u.x - p.x, u.z - p.z) <= 8;
  const k0 = packetOf(before.inp, WORKING), k = packetOf(after.inp, WORKING);
  const s0 = factsOf(before.inp, WORKING), s = factsOf(after.inp, WORKING);
  const cl = k.a.find(c => c.type === 'tr' && c.n > 1 && near(c, at));
  assert.equal(cl.state, 'i');                                                          // one state for all five
  const solo = s.a.filter(u => u.type === 'tr' && near(u, cl));
  assert.ok(solo.length > 1 && solo.every(u => u.n === 1 && u.ids.length === 1));        // each unit its own entry
  assert.deepEqual([...new Set(solo.map(u => u.state))].sort(), ['a', 'i']);             // both states survive
  assert.equal(decideFacts(k).o, decideFacts(k0).o);                                     // the packet cannot tell
  assert.notEqual(decideFacts(s).o, decideFacts(s0).o);                                  // the state can
});

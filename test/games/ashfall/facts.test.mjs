// facts.mjs is the state side of the fidelity oracle: the same facts read.mjs returns, built from the state with no packet.
// The invariant: when the packet is not budgeted, the two readers agree layer for layer. What the packet drops is the gap
// bin/oracle.mjs measures, and the last test here proves it measures something (drop F and the gather order changes).
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
const unbudgeted = (inputs, opts) => assemble(encode(inputs, opts), { maxTokens: 1e6, divisor: 3.5, fullEvery: 0, n: 2 });

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

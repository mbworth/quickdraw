// facts.mjs is the state side of the fidelity oracle: the same facts read.mjs returns, built from the state with no packet.
// The invariant: when the packet is not budgeted, the two readers agree layer for layer. What the packet drops is the gap
// bin/oracle.mjs measures, and the last test here proves it measures something (cut X and the push loses its target).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from '../../../src/games/microrts/coder.mjs';
import { factsOf } from '../../../src/games/microrts/facts.mjs';
import { read, ReadError } from '../../../src/games/microrts/read.mjs';
import { decideFacts, decide } from '../../../src/games/microrts/policy/rush.mjs';
import { assemble } from '../../../src/core/packet.mjs';
import { loadCases } from '../../../bin/bench.mjs';
import { HERE, fixtureFiles, loadFixture, snap, triggersOf, SAMPLE_LAST } from './helpers.mjs';

const KEYS = ['h', 'd', 't', 'p', 'e', 'a', 'b', 'x', 'l', 'layers'];
const HB = [{ cls: 'heartbeat', key: 'hb', t: 0 }];
const unbudgeted = inputs => assemble(encode(inputs), { maxTokens: 1e6, divisor: 3.5, fullEvery: 0, n: 2 });

function allInputs() {
  const files = fixtureFiles();
  return files.map((f, i) => {
    const fx = loadFixture(f), prev = i > 0 ? loadFixture(files[i - 1]) : null;
    return [f, { state: snap(fx, i + 1), prevDecisionState: prev && snap(prev, i), triggers: triggersOf(prev, fx), lastOrders: i > 0 ? SAMPLE_LAST : [], pending: [] }];
  });
}

test('unbudgeted, the packet reader and the state reader agree on every layer of every fixture', async () => {
  const cases = await loadCases('microrts');
  const inputs = [...allInputs(), ...cases.map(c => [c.id, { state: snap(c.fx, 1), prevDecisionState: null, triggers: HB, lastOrders: [], pending: [] }])];
  assert.ok(inputs.length > 20);
  for (const [id, inp] of inputs) {
    const k = read(unbudgeted(inp).text), s = factsOf(inp);
    for (const key of KEYS) assert.deepStrictEqual(s[key], k[key], `${id}: ${key}`);
    assert.deepEqual(decideFacts(s), decideFacts(k), `${id}: decision`);
  }
});

test('the reader is strict on the structured layers: an unknown token is a visible failure', () => {
  const ok = 'H t3 r5 u1/1\nP ba#20 IDLE\nE\nrs#16@0,0 o25 d4\nA\nwk x1@1,1 i #22\nB ba#20@2,2 hp10\nX\nba x1@13,13 d22/24 #21\nL none';
  assert.equal(read(ok).h.r, 5);
  for (const bad of ['H t3 r5 u1/1 wat', 'H t3 r5 u1/1\nP ba#20 wat wat', 'H t3 r5 u1/1\nA\nwk x1@1,1', 'H t3 r5 u1/1\nX\nba x1@13,13', 'H t3 r5 u1/1\nB ba#20@2,2', 'H t3 r5 u1/1\nE\nrs#16@0,0'])
    assert.throws(() => read(bad), ReadError, JSON.stringify(bad));
  assert.throws(() => read('D none'), ReadError, 'no header at all');
});

test('the open layers classify rather than reject: D, T and L take words they have never seen', () => {
  const k = read('H t3 r5 u1/1\nD +wk#31 -wk#24 E+li#48 ba#20 hp6 r+8 wat\nT hb; lost wk#22; seen at 0,1 x3; done wk#31\nL t 20 wk ok; h #22 #16 wait');
  assert.deepEqual(k.d.gained.map(i => i.id), [31]);
  assert.deepEqual(k.d.lost.map(i => i.id), [24]);
  assert.deepEqual(k.d.hurt.map(i => i.hp), [6]);
  assert.equal(k.d.r, 8);
  assert.equal(k.d.items.at(-1).kind, 'other');
  assert.deepEqual(k.t.lost.map(i => i.id), [22]);
  assert.deepEqual(k.t.contact.map(i => i.cell), ['0,1']);
  assert.equal(k.l.items.length, 2);
  assert.equal(k.l.items[1].ok, false);
});

test('the policy plays from the packet text alone and from the facts, identically', () => {
  for (const [id, inp] of allInputs()) {
    const text = assemble(encode(inp), { maxTokens: 400, divisor: 3.5 }).text;
    assert.deepEqual(decide(text), decideFacts(read(text)), id);
  }
});

const RUNS = path.join(path.resolve(HERE, '../../..'), 'runs/mrts');
test('the oracle runs over a recording and reports its shape', { skip: !fs.existsSync(RUNS) || !fs.readdirSync(RUNS).length }, async () => {
  const { oracleRun } = await import('../../../bin/oracle.mjs');
  const file = path.join(RUNS, fs.readdirSync(RUNS).filter(f => f.endsWith('.jsonl')).sort()[0]);
  const r = await oracleRun(file, { every: 10, policy: 'rush' });
  const s = r.summary;
  assert.equal(r.game, 'microrts');
  assert.ok(s.decisions > 3 && s.decided === s.decisions);
  assert.deepEqual([s.errors.packet, s.errors.state], [0, 0], s.errors.firstPacket || s.errors.firstState || '');
  assert.ok(s.samePct >= s.exactPct && s.samePct <= 100);
  for (const k of Object.keys(s.layerDiff)) assert.ok(KEYS.includes(k));
});

test('the gap is real: cut X to the budget and the push has nowhere to go', async () => {
  const [, inp] = allInputs().at(-1);
  const full = read(assemble(encode(inp), { maxTokens: 1e6, divisor: 3.5 }).text);
  const slim = { ...full, x: [] };                       // X is over half the packet: it is what a tight budget takes
  assert.ok(full.x.length, 'the fixture must carry enemies for this to mean anything');
  assert.notDeepStrictEqual(decideFacts(slim).why, decideFacts(full).why);
});

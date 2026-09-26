import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { simulate, splitArgs, gated, callPre, callNew } from '../../bin/replay-commander.mjs';
import { ROOT } from '../../bin/_boot.mjs';
import { readRun } from '../../src/core/record.mjs';
import { feedbackLayer, expectTracker } from '../../src/core/commander.mjs';
import { apply, measure, createObserver } from '../../src/games/microrts/policy/commander.mjs';
import { DEFAULTS, decide } from '../../src/games/microrts/policy/rush.mjs';

const RUN = path.join(ROOT, 'runs/microrts-basesWorkers16x16-GuidedRojoA3N-mub5ms7q.jsonl');
const rowsOf = () => readRun(RUN);

test('simulate reconstructs one launch per landed commander seq', t => {
  if (!fs.existsSync(RUN)) return t.skip('run file absent');
  const rows = rowsOf().slice(0, 200);
  const seqs = new Set(rows.filter(r => r.kind === 'call' && r.raw?.commander?.input && !r.raw.commander.error).map(r => r.raw.commander.seq));
  const results = simulate(rows, { apply, decide, DEFAULTS });
  assert.deepEqual(results.map(r => r.seq), [...seqs].sort((a, b) => a - b));
  const track = expectTracker(measure);
  for (const c of results) {
    for (const pk of c.since) track.see(pk);
    assert.ok(feedbackLayer({ ...c.fb, expect: track.read() }).startsWith('F '));
  }
});

// The run predates the tracker's first-claim `since` fix, so `claim since tN` is not compared.
test('simulate: the recorded model F equals the live F on the first 30 landings (at-clause stripped)', t => {
  if (!fs.existsSync(RUN)) return t.skip('run file absent');
  const rows = rowsOf();
  const rec = new Map(rows.filter(r => r.kind === 'call' && r.raw?.commander?.input).map(r => [r.raw.commander.seq, r.raw.commander.feedback]));
  const norm = s => s.replace(/ \| at target[^|]*/, '').replace(/claim since t\d+/, 'claim since');
  const calls = simulate(rows, { apply, decide, DEFAULTS, measure }).slice(0, 30);
  assert.equal(calls.length, 30);
  for (const c of calls) assert.equal(norm(feedbackLayer({ ...c.fb, expect: c.oldExpect })), norm(rec.get(c.seq)), `seq ${c.seq}`);
});

test('splitArgs: flags first, leftover positional', () => {
  assert.deepEqual(splitArgs(['--prompt', 'p.md', 'run.jsonl', '--dry-run', '--at', '--from-seq=3'], ['dry-run', 'at']),
    { flagArgs: ['--prompt', 'p.md', '--dry-run', '--at', '--from-seq=3'], positional: ['run.jsonl'] });
});

test('gated: a skipped call\'s packets and prevApiPacketN ride into the next kept one', () => {
  const c = (seq, why, since, prev) => ({ seq, why, since, prevApiPacketN: prev });
  const k = gated([c(1, ['first call'], ['a'], 0), c(2, null, ['b'], 1), c(3, null, ['c'], 2), c(4, ['expect MET'], ['d'], 3), c(5, null, ['e'], 4)]);
  assert.deepEqual(k.map(x => [x.seq, x.since.join(''), x.prevApiPacketN]), [[1, 'a', 0], [4, 'bcd', 1]]);
});

const price = { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 };
const usage = { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 };

test('callPre: plain text call, no tools/tool_choice, message+pre, 300 max_tokens, works for Fable too', async () => {
  let seen;
  const client = { messages: { create: async req => { seen = req; return { content: [{ type: 'text', text: 'yes' }], usage }; } } };
  const res = await callPre({ client, model: 'claude-fable-5-1', system: 'S', effort: 'low', message: 'M', pre: 'Q?', price });
  assert.equal(seen.tools, undefined);
  assert.equal(seen.tool_choice, undefined);
  assert.equal(seen.max_tokens, 300);
  assert.deepEqual(seen.messages, [{ role: 'user', content: 'M\n\nQ?' }]);
  assert.equal(res.answer, 'yes');
  assert.ok(res.spend > 0);
});

test('callNew: message carries the pre Q/A when built with it', async () => {
  let seen;
  const client = { messages: { create: async req => { seen = req; return { content: [{ type: 'tool_use', name: 'plan', input: { plan: 'p' } }], usage }; } } };
  const tool = { type: 'object', properties: {}, additionalProperties: false };
  const message = 'M\nQ: Q?\nA: yes';
  const res = await callNew({ client, model: 'claude-sonnet-5', system: 'S', tool, toolDescription: 'd', effort: 'low', message, price });
  assert.deepEqual(seen.messages, [{ role: 'user', content: message }]);
  assert.equal(res.input.plan, 'p');
});

test('simulate --gate: first launch kept, each kept launch is the first at or after its event, the heartbeat adds picks', t => {
  if (!fs.existsSync(RUN)) return t.skip('run file absent');
  const rows = rowsOf();
  const run = maxEveryMs => simulate(rows, { apply, decide, DEFAULTS, measure, gate: { observer: createObserver({ classifiers: 'gone,econ' }), maxEveryMs } });
  const all = run(0), kept = all.filter(c => c.why);
  assert.equal(all.length, simulate(rows, { apply, decide, DEFAULTS }).length);
  assert.deepEqual(all[0].why, ['first call']);
  assert.ok(all.events > 0 && kept.length > 1 && kept.length < all.length);
  const base = kept.find(c => c.why.some(w => /^gone: their ba#\d+ gone t2018$/.test(w)));
  assert.ok(base && Number(base.cycle) >= 2018 && all[all.indexOf(base) - 1].cycle < 2018);
  const hb = run(20000).filter(c => c.why);
  assert.ok(hb.length > kept.length && hb.some(c => c.why.includes('heartbeat 20 s')));
});

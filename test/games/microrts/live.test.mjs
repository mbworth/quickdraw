// Integration against the real engine: spawns java from MICRORTS_LOCAL and plays a short game. Skipped otherwise.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAdapter } from '../../../src/games/microrts/index.mjs';
import { realClock } from '../../../src/core/clock.mjs';
import { readRun } from '../../../src/core/record.mjs';
import { summarize } from '../../../bin/pace.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const skip = !process.env.MICRORTS_LOCAL ? 'set MICRORTS_LOCAL to the built microrts clone' : false;
let live = null;   // the java child dies with the adapter even if an assertion throws first
after(async () => { try { await live?.leave(); } catch {} });

const node = args => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 240000 });

test('a real 300-cycle game: states flow, events fire, the engine says gameOver', { skip, timeout: 120000 }, async () => {
  const a = createAdapter(process.env, { clock: realClock(), port: 0, cycleMs: 5, maxCycles: 300, refreshMs: 100 });
  live = a;
  const states = [], events = [];
  let done = null;
  a.on('state', s => states.push(s));
  a.on('event', e => events.push(e));
  a.on('done', d => { done = d; });
  await a.connect();
  assert.equal((await a.seat()).seat, 0);
  await new Promise(r => { const poll = setInterval(() => { if (done) fin(); }, 50); const cap = setTimeout(fin, 90000); function fin() { clearInterval(poll); clearTimeout(cap); r(); } });
  await a.leave();
  assert.ok(done, 'gameOver never arrived');
  assert.ok(states.length > 5, `${states.length} states`);
  assert.equal(states.at(-1).header.lifecycle, 'ended');
  assert.ok(states.some(s => s.header.clocks.cycle > 200), 'the game ran');
  assert.ok(events.some(e => e.key === 'started'));
  const n = states.find(s => s.header.lifecycle === 'active').native;
  assert.equal(n.width, 16);
  assert.ok(n.tt.Worker.cost >= 1, 'the type table came over the wire');
  assert.ok(n.units.some(u => u.player === 1), 'the opponent is on the board');
});

test('bin/pilot end to end, then pace, replay and layers over its run file', { skip, timeout: 240000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-mrts-run-'));
  const r = node(['bin/pilot.mjs', '--game', 'microrts', '--model', 'script:rush', '--run-dir', dir,
    '--microrts-port', '0', '--microrts-cycle-ms', '20', '--microrts-max-cycles', '600']);
  assert.ok([0, 1, 3].includes(r.status), `pilot exited ${r.status}: ${r.stderr?.slice(-800)}`);
  const file = path.join(dir, fs.readdirSync(dir).find(f => f.endsWith('.jsonl')));
  const rows = readRun(file);
  assert.equal(rows[0].kind, 'config');
  assert.equal(rows[0].game, 'microrts');
  const s = summarize(rows);
  assert.ok(s.decisions >= 3, `${s.decisions} decisions`);
  assert.ok(s.estP50 > 0 && s.estP50 < 400, `packet est p50 ${s.estP50}`);
  assert.ok(rows.some(x => x.kind === 'done'), 'no done line');
  console.log('pace:', JSON.stringify({ decisions: s.decisions, perMinute: s.perMinute, estP50: s.estP50, ordersSent: s.ordersSent, keptShare: s.keptShare, outcome: s.outcome }));

  const rep = node(['bin/replay.mjs', file, 'all']);
  assert.equal(rep.status, 0, rep.stdout + rep.stderr);
  assert.match(rep.stderr, /(\d+)\/\1 packets reproduced byte for byte/);
  assert.equal(node(['bin/pace.mjs', file]).status, 0);
  assert.equal(node(['bin/pace.mjs', '--row', 'microrts', file]).status, 0);
  const lay = node(['bin/layers.mjs', file]);
  assert.equal(lay.status, 0, lay.stderr);
  assert.match(lay.stdout, /enemy/);
  fs.rmSync(dir, { recursive: true, force: true });
});

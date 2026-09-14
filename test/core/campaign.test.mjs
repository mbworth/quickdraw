import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { arms, armFlags, parseAb, highClassWait, wilson, nextGameNumber, report, finished, insertRow } from '../../bin/campaign.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const call = (n, cls, waitMs) => ({ kind: 'call', n, triggers: [{ cls, key: 'k' }], latency: { waitMs } });

test('arms alternate from the first arm and the A/B flag is appended only when on', () => {
  assert.deepEqual(arms(4), ['on', 'off', 'on', 'off']);
  assert.deepEqual(arms(3, 'off'), ['off', 'on', 'off']);
  const ab = parseAb('reserve=danger,contact,loss');
  assert.deepEqual(ab, { flag: 'reserve', value: 'danger,contact,loss', classes: ['danger', 'contact', 'loss'] });
  assert.deepEqual(armFlags(['--game', 'x'], ab, 'on'), ['--game', 'x', '--reserve', 'danger,contact,loss']);
  assert.deepEqual(armFlags(['--game', 'x'], ab, 'off'), ['--game', 'x']);
  assert.deepEqual(armFlags(['--game', 'x'], null, 'on'), ['--game', 'x']);
  assert.throws(() => parseAb('reserve'));
});

test('high-class wait: led by a reserved class, call 1 excluded, behind = wait over 600 ms (over 0 under event tick)', () => {
  const rows = [call(1, 'danger', 2000), call(2, 'danger', 100), call(3, 'contact', 900), call(4, 'economy', 5000), call(5, 'loss', 700), { kind: 'call', n: 6, triggers: [], latency: { waitMs: 9 } }];
  assert.deepEqual(highClassWait(rows, ['danger', 'contact', 'loss']), { calls: 3, behind: 2, behindPct: 67, waitP50: 700, waitP90: 900 });
  assert.deepEqual(highClassWait([], ['danger']), { calls: 0, behind: 0, behindPct: null, waitP50: null, waitP90: null });
  const tick = [{ kind: 'config', eventTick: true }, call(2, 'danger', 100), call(3, 'danger', 0), { ...call(4, 'danger', 900), anchor: 'tick' }, { ...call(5, 'loss', 900), triggers: [{ cls: 'loss', key: 'k', derived: true }] }];
  assert.deepEqual(highClassWait(tick, ['danger', 'loss']), { calls: 2, behind: 1, behindPct: 50, waitP50: 100, waitP90: 100 }, 'under event tick any wait is time behind a call; tick-anchored and derived calls are not reactions');
});

test('wilson interval and the next games.md number', () => {
  assert.deepEqual(wilson(12, 20), [39, 78]);
  assert.deepEqual(wilson(0, 0), [null, null]);
  assert.equal(nextGameNumber('| game |\n|---|\n| 1-3 | x |\n| 30 | a |\n| 31 | b |\n'), 32);
  assert.equal(nextGameNumber(''), 1);
  assert.equal(insertRow('| game |\n|---|\n| 31 | a |\n\n## Opponent\nprose\n', '| 32 | b |'), '| game |\n|---|\n| 31 | a |\n| 32 | b |\n\n## Opponent\nprose\n');
  assert.equal(insertRow('', '| 1 | x |'), '| 1 | x |\n');
});

test('report: per-arm rows with wins, interval and the high-class share', () => {
  const g = (i, arm, won, behindPct, calls = 100) => ({ i, arm, gameNumber: 40 + i, summary: { outcome: { won }, gameId: String(50 + i), minutes: 6, reactionP50: 2300 + i, firstP50: 2200, usd: 1 }, hi: { calls, behind: Math.round(behindPct * calls / 100), behindPct, waitP50: 100, waitP90: 900 } });
  const stoppedGame = { i: 3, arm: 'off', summary: { outcome: {}, why: 'stop-file', usd: 0.5 } };
  const out = report({ name: 'reserve', n: 4, ab: parseAb('reserve=danger'), games: [g(0, 'on', true, 30), g(1, 'off', false, 43), g(2, 'on', true, 10, 300), stoppedGame] });
  assert.match(out, /3\/4 games, 1 stopped \(rerun on resume\), A\/B --reserve danger/);
  assert.ok(!finished(stoppedGame) && finished(g(0, 'on', true, 30)));
  assert.match(out, /^on\s+2\s+2\s+100\s+34–100\s+2302\s+2200\s+400\s+15%\s+100\s+2$/m, 'the share is pooled over calls (60 of 400), not a median of per-game shares');
  assert.match(out, /^off\s+1\s+0\s+0\s+0–79\s+2301\s+2200\s+100\s+43%\s+100\s+1$/m);
});

test('two mock games end to end: state file, logs, resume skips finished games', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-campaign-'));
  const state = path.join(dir, 'c.json');
  const argv = ['bin/campaign.mjs', '--games', '2', '--ab', 'reserve=turn', '--out', state, '--pause', '0', '--', '--game', 'mock', '--model', 'none', '--run-dir', path.join(dir, 'runs')];
  const r = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr.slice(-2000));
  const s = JSON.parse(fs.readFileSync(state, 'utf8'));
  assert.deepEqual(s.games.map(g => g.arm), ['on', 'off']);
  assert.ok(s.games.every(g => g.summary?.outcome?.won === true && g.exitCode === 0 && fs.existsSync(g.log)));
  assert.ok(s.games[0].argv.includes('--reserve') && !s.games[1].argv.includes('--reserve'));
  assert.match(r.stdout, /2\/2 games/);
  const again = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: 'utf8' });
  assert.equal(again.status, 0);
  assert.doesNotMatch(again.stderr, /game 1\/2|game 2\/2/);   // nothing left to run
  fs.rmSync(dir, { recursive: true, force: true });
});

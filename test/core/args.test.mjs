import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, loadEnv, loadAdapterModule } from '../../src/core/args.mjs';

test('flags coerce numbers and booleans, camelCase, and route --<game>-* into gameOpts', () => {
  const r = parseArgs(['--game', 'ashfall', '--packet-max', '400', '--max-usd=0.5', '--print-config', '--thinking', 'off', '--ashfall-size', '200', '--ashfall-open', 'true', '--ashfall-game=12'], { booleans: ['print-config'], game: 'ashfall' });
  assert.deepEqual(r.flags, { game: 'ashfall', packetMax: 400, maxUsd: 0.5, printConfig: true, thinking: 'off' });
  assert.deepEqual(r.gameOpts, { size: 200, open: true, game: 12 });
  assert.throws(() => parseArgs(['--model']), /needs a value/);
  assert.throws(() => parseArgs(['stray']), /unexpected argument/);
});

test('.env loads without overriding the environment and strips quotes', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qd-env-')), '.env');
  fs.writeFileSync(f, `QD_T1="a b"\nQD_T2=  c  \n# comment\nPATH=/nope\n`);
  await loadEnv(f);
  assert.equal(process.env.QD_T1, 'a b'); assert.equal(process.env.QD_T2, 'c');
  assert.notEqual(process.env.PATH, '/nope');
  assert.equal(await loadEnv(f + '.missing'), false);
});

test('adapter names are anchored: no path escapes src/games', async () => {
  await assert.rejects(loadAdapterModule('../core/pilot'), /bad game name/);
  await assert.rejects(loadAdapterModule('nope'), /no such game/);
  assert.equal(typeof (await loadAdapterModule('mock')).createAdapter, 'function');
});

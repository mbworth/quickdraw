import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CORE = path.join(ROOT, 'src/core');
const isSelfTest = process.env.QD_BOUNDARY_INNER === '1';

function imports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1] || m[2]);
  return out;
}

test('src/core resolves nothing under src/games, transitively', { skip: isSelfTest }, () => {
  const seen = new Set(), queue = fs.readdirSync(CORE).filter(f => f.endsWith('.mjs')).map(f => path.join(CORE, f));
  while (queue.length) {
    const f = queue.pop(); if (seen.has(f)) continue; seen.add(f);
    for (const spec of imports(f)) {
      if (!spec.startsWith('.')) continue;
      const r = path.resolve(path.dirname(f), spec);
      assert.ok(!r.startsWith(path.join(ROOT, 'src/games')), `${path.relative(ROOT, f)} imports ${spec}`);
      queue.push(r);
    }
  }
  assert.ok(seen.size >= 8);
});

test('the core suite passes in a copy of the repo without src/games/ashfall', { skip: isSelfTest }, () => {
  // A copy, not an in-place rename: node --test runs files in parallel and the adapter tests import ashfall.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-core-only-'));
  try {
    for (const d of ['src/core', 'src/lib', 'src/games/mock', 'bin', 'test/core', 'config']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
    assert.ok(!fs.existsSync(path.join(tmp, 'src/games/ashfall')));
    const r = spawnSync(process.execPath, ['--test', 'test/core/'], { cwd: tmp, env: { ...process.env, QD_BOUNDARY_INNER: '1' }, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

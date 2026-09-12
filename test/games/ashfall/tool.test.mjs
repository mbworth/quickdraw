import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tool } from '../../../src/games/ashfall/tool.mjs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src/games/ashfall/tool.mjs');
const sha = o => createHash('sha256').update(JSON.stringify(o)).digest('hex');

test('the schema file is a literal: no runtime construction', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  for (const bad of ['=>', 'function', '.map(', 'Object.keys', 'for (', 'JSON.parse', '${']) assert.ok(!src.includes(bad), `contains ${bad}`);
  assert.ok(Object.isFrozen(tool));
});

test('the sha is stable across two imports', async () => {
  const a = sha(tool);
  const { tool: again } = await import('../../../src/games/ashfall/tool.mjs?again');
  assert.equal(sha(again), a);
});

// A strict-mode checker: objects close additionalProperties, require every property, and use only supported forms.
function checkStrict(schema, at, defs) {
  if (schema.$ref) { assert.ok(schema.$ref.startsWith('#/$defs/') && defs[schema.$ref.slice(8)], `${at}: dangling ${schema.$ref}`); return; }
  if (schema.anyOf) { schema.anyOf.forEach((s, i) => checkStrict(s, `${at}.anyOf[${i}]`, defs)); return; }
  if (schema.const !== undefined || schema.enum) return;
  const types = [].concat(schema.type);
  assert.ok(types.every(t => ['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'].includes(t)), `${at}: type ${types}`);
  if (types.includes('object')) {
    assert.equal(schema.additionalProperties, false, `${at}: additionalProperties`);
    const keys = Object.keys(schema.properties || {});
    assert.deepEqual([...(schema.required || [])].sort(), [...keys].sort(), `${at}: required must list every property`);
    for (const k of keys) checkStrict(schema.properties[k], `${at}.${k}`, defs);
  }
  if (types.includes('array')) checkStrict(schema.items, `${at}[]`, defs);
}

test('every variant validates under strict rules and is discriminated by cmd', () => {
  checkStrict(tool, 'root', tool.$defs);
  assert.deepEqual(tool.required, ['act', 'cmds', 'note']);
  const names = tool.properties.cmds.items.anyOf.map(r => r.$ref.slice(8));
  assert.deepEqual(names, ['move', 'attack', 'stop', 'disband', 'gather', 'repair', 'build', 'train', 'research', 'cancel', 'rally']);
  for (const n of names) { assert.equal(tool.$defs[n].properties.cmd.const, n); checkStrict(tool.$defs[n], n, tool.$defs); }
});

// Calibrates the chars-per-token divisor from messages.countTokens over every fixture packet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assemble } from '../../../src/core/packet.mjs';
import { fixtureFiles, layersAt } from './helpers.mjs';

const KEY = process.env.ANTHROPIC_API_KEY;
const COMMITTED = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../src/games/microrts/calibration.json');
const files = fixtureFiles();

test('the committed divisor exists, is plausible, and is what the adapter uses', async () => {
  const { divisor } = JSON.parse(fs.readFileSync(COMMITTED, 'utf8'));
  assert.ok(divisor > 1 && divisor < 6, `divisor ${divisor}`);
  const mod = await import('../../../src/games/microrts/index.mjs');
  assert.equal(mod.divisor, divisor);
});

test('countTokens recalibration agrees with the committed divisor within 10%', { skip: !KEY || !files.length ? 'needs ANTHROPIC_API_KEY and fixtures' : false, timeout: 120000 }, async () => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const model = process.env.QUICKDRAW_MODEL || 'claude-sonnet-5';
  let chars = 0, tokens = 0, n = 0;
  for (let i = 0; i < files.length; i++) {
    const text = assemble(layersAt(i), { maxTokens: 100000 }).text;
    const r = await client.messages.countTokens({ model, messages: [{ role: 'user', content: text }] });
    chars += text.length; tokens += r.input_tokens; n++;
  }
  const divisor = Math.round((chars / tokens) * 100) / 100;
  fs.writeFileSync(COMMITTED + '.new', JSON.stringify({ divisor, model, samples: n, chars, tokens, date: new Date().toISOString().slice(0, 10) }, null, 1) + '\n');
  const committed = JSON.parse(fs.readFileSync(COMMITTED, 'utf8')).divisor;
  assert.ok(Math.abs(divisor - committed) / committed <= 0.1, `measured ${divisor} vs committed ${committed}; review calibration.json.new`);
});

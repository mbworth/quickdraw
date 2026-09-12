// Shared CLI boot: repo root, .env, flags, prices, model construction, redaction. Not an entry point.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs, loadEnv } from '../src/core/args.mjs';
import { createModel } from '../src/core/model.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha = s => createHash('sha256').update(s).digest('hex');
export const prices = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'config/prices.json'), 'utf8'));
// A key passed as a flag must not reach the run file or stderr.
export const redact = obj => JSON.parse(JSON.stringify(obj, (k, v) => (/key|token|secret/i.test(k) && typeof v === 'string' ? '[redacted]' : v)));
// Server-supplied ids name files under runs/; nothing else may.
export const safeId = id => String(id).replace(/[^A-Za-z0-9_-]/g, '_');

export async function boot(argv, opts = {}) {
  await loadEnv(path.join(ROOT, '.env'));
  return parseArgs(argv, opts);
}

export async function modelFor({ adapter, model, system, thinking = 'adaptive', effort = 'low', decisionDeadlineMs, clock }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return createModel({ client: new Anthropic(), model, system, tool: adapter.tool, toolName: adapter.meta.toolName, toolDescription: adapter.meta.toolDescription, thinking: String(thinking), effort, decisionDeadlineMs, prices: prices(), clock });
}

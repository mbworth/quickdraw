// Shared CLI boot: repo root, .env, flags, prices, model construction, redaction. Not an entry point.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs, loadEnv } from '../src/core/args.mjs';
import { createModel, scriptModel } from '../src/core/model.mjs';

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

export const isScript = model => /^script:/.test(String(model || ''));
// --model script:<name>: src/games/<game>/policy/<name>.mjs plays instead of the API (no key, no prompt, $0); needs the order language decode.
export async function modelFor({ adapter, game, model, system, thinking = 'adaptive', effort = 'low', reply = 'tool', stream = false, decisionDeadlineMs, clock }) {
  if (isScript(model)) {
    const name = String(model).slice(7);
    if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error(`bad policy name ${name}`);
    const g = game || adapter.meta?.game;
    if (!g) throw new Error('modelFor: game is required for a script model');
    const { decide } = await import(path.join(ROOT, 'src/games', g, 'policy', `${name}.mjs`));
    if (!adapter.decode) throw new Error('--model script:* needs the order language (--ashfall-lang true)');
    return scriptModel({ decide, decode: adapter.decode, clock });
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return createModel({ client: new Anthropic(), model, system, tool: adapter.tool, toolName: adapter.meta.toolName, toolDescription: adapter.meta.toolDescription, decode: adapter.decode, thinking: String(thinking), effort, reply: String(reply), stream: !!stream, decisionDeadlineMs, prices: prices(), clock });
}

// Shared CLI boot: repo root, .env, flags, prices, model construction, redaction. Not an entry point.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs, loadEnv } from '../src/core/args.mjs';
import { createModel, scriptModel, withMemory } from '../src/core/model.mjs';
import { commanderModel } from '../src/core/commander.mjs';

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
export const isCommander = model => /^commander:/.test(String(model || ''));
const policyOf = async (adapter, game, model, prefix) => {
  const name = String(model).slice(prefix.length);
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error(`bad policy name ${name}`);
  const g = game || adapter.meta?.game;
  if (!g) throw new Error('modelFor: game is required for a policy model');
  if (!adapter.decode) throw new Error(`--model ${prefix}* needs the order language (--ashfall-lang true)`);
  return { dir: path.join(ROOT, 'src/games', g, 'policy'), name };
};
// --model script:<name>: src/games/<game>/policy/<name>.mjs plays instead of the API (no key, no prompt, $0); needs the order language decode.
// --model commander:<name>: that policy is the reflex (0 ms, every packet) and policy/commander.mjs's schema is the API model's
// parameter set, rewritten in the background every --commander-every ms.
// --script-params '{"train":"hv"}' overrides the policy's DEFAULTS for a script arm (a fixed commander setting at $0).
export async function modelFor({ adapter, game, model, system, thinking = 'adaptive', effort = 'low', reply = 'tool', stream = false, memory = 0, decisionDeadlineMs, clock, opts = {} }) {
  if (isScript(model)) {
    const { dir, name } = await policyOf(adapter, game, model, 'script:');
    const { decide, DEFAULTS } = await import(path.join(dir, `${name}.mjs`));
    const params = opts.scriptParams ? { ...DEFAULTS, ...opts.scriptParams } : null;
    return scriptModel({ decide: params ? t => decide(t, params) : decide, decode: adapter.decode, clock });
  }
  if (isCommander(model)) {
    const { dir, name } = await policyOf(adapter, game, model, 'commander:');
    const { decide } = await import(path.join(dir, `${name}.mjs`));
    const commander = await import(path.join(dir, 'commander.mjs'));
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const mem = Number(memory) || 0;
    const call = createModel({
      client: new Anthropic(), model: opts.commanderModel ?? 'claude-sonnet-5', system,
      tool: mem > 0 ? withMemory(commander.tool, mem) : commander.tool, toolName: 'plan', toolDescription: commander.toolDescription,
      decode: input => ({ act: false, orders: [], note: typeof input.n === 'string' ? input.n : null }),
      thinking: String(thinking), effort, reply: 'tool', decisionDeadlineMs, prices: prices(), clock,
    });
    return commanderModel({ reflex: decide, decode: adapter.decode, commander: call, params: commander.defaults, apply: commander.apply, measure: commander.measure ?? null, describe: commander.describe ?? null, everyMs: opts.commanderEveryMs ?? 5000, clock });
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return createModel({ client: new Anthropic(), model, system, tool: adapter.tool, toolName: adapter.meta.toolName, toolDescription: adapter.meta.toolDescription, decode: adapter.decode, thinking: String(thinking), effort, reply: String(reply), stream: !!stream, memory: Number(memory) || 0, decisionDeadlineMs, prices: prices(), clock });
}

// The commander's tool schema, for the run's config line (the API sees this, not adapter.tool).
export async function commanderToolFor({ adapter, game, model, memory = 0 }) {
  const { dir } = await policyOf(adapter, game, model, 'commander:');
  const { tool } = await import(path.join(dir, 'commander.mjs'));
  return memory > 0 ? withMemory(tool, memory) : tool;
}

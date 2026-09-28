#!/usr/bin/env node
// Plan bench: given a fixed commander packet (real game layers + F + a hand-written S block + O lines), does the model
// follow its plan, keep it, or replace it. One tool call per sample, scored by a predicate on the tool input.
// node bin/plan-bench.mjs --prompt prompts/microrts/commander09-sonnet.md --cases test/prompts/microrts/plan-cases.mjs
//                         [--model claude-sonnet-5] [--effort medium] [--repeats 8] [--only name] [--out runs/plan-bench-<ts>.jsonl] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, boot, prices } from './_boot.mjs';
import { buildRequest, withMemory, cost, pickUsage } from '../src/core/model.mjs';
import { toolSteps, toolStepsDescription } from '../src/games/microrts/policy/commander.mjs';

const CONCURRENCY = 4;
const MEMORY = 300;   // matches the live commander's --memory, so the tool schema the model sees is the same

// failLine(name, input) → the one-line report for a sample that failed its case's predicate.
export function failLine(name, input) {
  const steps = input ? JSON.stringify(input.steps ?? null) : 'null';
  return `${name}: steps=${steps} why=${input?.why ?? null} train=${input?.train} pushLight=${input?.pushLight}`;
}

export async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const j = i++; await fn(items[j], j); }
  }));
}

async function main() {
  const { flags } = await boot(process.argv.slice(2), { booleans: ['dry-run'] });
  if (!flags.prompt) throw new Error('--prompt is required');
  if (!flags.cases) throw new Error('--cases is required');

  const system = fs.readFileSync(path.resolve(flags.prompt), 'utf8');
  const mod = await import(path.resolve(flags.cases));
  const allCases = mod.cases ?? mod.default;
  const cases = flags.only ? allCases.filter(c => c.name.includes(String(flags.only))) : allCases;

  if (flags.dryRun) {
    for (const c of cases) console.log(`${c.name}${c.note ? ` (${c.note})` : ''}\n${c.packet}\n`);
    return;
  }

  const model = flags.model || 'claude-sonnet-5';
  const effort = flags.effort || 'medium';
  const repeats = Number(flags.repeats ?? 8);
  const price = prices()[model];
  if (!price) throw new Error(`no price for "${model}" in config/prices.json`);
  const tool = withMemory(toolSteps, MEMORY);

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  const outPath = path.resolve(flags.out || path.join(ROOT, 'runs', `plan-bench-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { flags: 'a' });

  let totalSpend = 0;
  const results = [];
  for (const c of cases) {
    let ok = 0, spend = 0;
    const fails = [];
    await pool(Array.from({ length: repeats }, (_, i) => i), CONCURRENCY, async i => {
      const req = buildRequest({ model, system, tool, toolName: 'plan', toolDescription: toolStepsDescription, thinking: 'adaptive', effort, reply: 'tool', packet: c.packet });
      let input = null, usage = null, spent = 0, error = null, good = false;
      try {
        const res = await client.messages.create(req);
        input = (res.content || []).find(b => b.type === 'tool_use')?.input ?? null;
        usage = pickUsage(res.usage);
        spent = cost(usage, price);
        good = !!input && !!c.expect(input);
      } catch (err) { error = String(err?.message || err); }
      spend += spent; totalSpend += spent;
      if (good) ok++; else fails.push(failLine(c.name, input));
      out.write(JSON.stringify({ case: c.name, i, input, ok: good, usage, spend: spent, error }) + '\n');
    });
    results.push({ name: c.name, ok, total: repeats, spend, fails });
  }
  out.end();

  console.log(`${'case'.padEnd(28)} n/N    $`);
  for (const r of results) console.log(`${r.name.padEnd(28)} ${String(r.ok).padStart(2)}/${r.total}  $${r.spend.toFixed(4)}`);
  console.log('');
  for (const r of results) for (const f of r.fails) console.log(f);
  console.log(`\ntotal spend $${totalSpend.toFixed(3)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}

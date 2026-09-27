#!/usr/bin/env node
// Comprehension bench: does the model understand one section of a prompt at a time? One text-reply call per question.
// node bin/comprehend.mjs --prompt prompts/microrts/commander08-sonnet.md --cases test/prompts/microrts/comprehension.mjs
//                         [--model claude-sonnet-5] [--effort low] [--thinking off|adaptive] [--repeats 8] [--set default|composite] [--context case|front|back|all|A,B,...] [--only name] [--why] [--message file] [--out runs/comprehend-<ts>.jsonl] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, boot, prices } from './_boot.mjs';
import { buildRequest, cost, pickUsage } from '../src/core/model.mjs';

const BOOL = ['dry-run', 'why'];
const CONCURRENCY = 4;

// parseSections(text) → Map<heading, body> in document order; text before the first `## ` is "Role".
export function parseSections(text) {
  const sections = new Map();
  let name = 'Role', buf = [];
  for (const line of text.split('\n')) {
    const m = /^##\s+(.*)$/.exec(line);
    if (!m) { buf.push(line); continue; }
    sections.set(name, buf.join('\n').trim());
    name = m[1].trim(); buf = [line];
  }
  sections.set(name, buf.join('\n').trim());
  return sections;
}

// systemFor(sections, names) → the named sections' bodies, prompt order, blank-line joined.
export function systemFor(sections, names) {
  for (const n of names) if (!sections.has(n)) throw new Error(`unknown section "${n}"`);
  return [...sections.keys()].filter(k => names.includes(k)).map(k => sections.get(k)).join('\n\n');
}

// contextFor(sections, caseNames, ctx) → section names to send: the case's own plus a wider context.
// front = every section before 'The packet', back = 'The packet' onward, all = everything, else a comma list.
export function contextFor(sections, caseNames, ctx = 'case') {
  const keys = [...sections.keys()], cut = keys.indexOf('The packet');
  const extra = ctx === 'case' ? [] : ctx === 'all' ? keys : ctx === 'front' ? keys.slice(0, cut) : ctx === 'back' ? keys.slice(cut) : ctx.split(',').map(x => x.trim());
  return [...new Set([...caseNames, ...extra])];
}

// checkExpect(expect, answer) → string: exact match, trimmed/backtick-stripped/case-insensitive; RegExp: .test; function: itself.
export function checkExpect(expect, answer) {
  if (typeof expect === 'function') return !!expect(answer);
  if (expect instanceof RegExp) return expect.test(answer.trim());
  const norm = s => String(s).trim().replace(/`/g, '').replace(/[.!\s]+$/, '').toLowerCase();
  return norm(answer) === norm(expect);
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const j = i++; await fn(items[j], j); }
  }));
}

async function main() {
  const { flags } = await boot(process.argv.slice(2), { booleans: BOOL });
  if (!flags.prompt) throw new Error('--prompt is required');
  if (!flags.cases) throw new Error('--cases is required');

  const sections = parseSections(fs.readFileSync(path.resolve(flags.prompt), 'utf8'));
  const mod = await import(path.resolve(flags.cases));
  const allCases = mod[flags.set || 'default'] ?? (() => { throw new Error(`no export "${flags.set}" in cases file`); })();
  const cases = flags.only ? allCases.filter(c => c.name.includes(String(flags.only))) : allCases;

  const model = flags.model || 'claude-sonnet-5';
  const effort = flags.effort || 'low';
  const thinking = flags.thinking || 'off';
  const repeats = Number(flags.repeats ?? 8);
  const ctx = String(flags.context || 'case');
  const preface = flags.message ? fs.readFileSync(path.resolve(String(flags.message)), 'utf8').trim() + '\n\nQuestion: ' : '';

  if (flags.dryRun) {
    for (const c of cases) {
      const system = systemFor(sections, contextFor(sections, c.sections, ctx));
      const words = system.split(/\s+/).filter(Boolean).length;
      console.log(`${c.name} [${c.sections.join(', ')}] words=${words}\nQ: ${c.q}\n`);
    }
    return;
  }

  const price = prices()[model];
  if (!price) throw new Error(`no price for "${model}" in config/prices.json`);
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  const outPath = path.resolve(flags.out || path.join(ROOT, 'runs', `comprehend-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { flags: 'a' });

  let totalSpend = 0;
  const results = [];

  for (const c of cases) {
    const names = contextFor(sections, c.sections, ctx);
    const system = systemFor(sections, names);
    const free = !('expect' in c);   // a probe: no scorer, answers printed
    const question = `${c.q}\n${free ? 'Answer in one or two sentences.' : flags.why ? 'Answer with the value asked for, then one sentence saying which line of the system prompt gave it to you.' : 'Answer with only the value asked for, no explanation.'}`;
    let correct = 0, spend = 0;
    const wrong = [];
    await pool(Array.from({ length: repeats }, (_, i) => i), CONCURRENCY, async i => {
      const req = buildRequest({ model, system, thinking, effort, reply: 'text', packet: preface + question });
      req.max_tokens = thinking === 'off' ? (flags.why || free ? 300 : 200) : 2000;
      let answer = '', usage = null, spent = 0, error = null;
      try {
        const res = await client.messages.create(req);
        answer = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        usage = pickUsage(res.usage);
        spent = cost(usage, price);
      } catch (err) { error = String(err?.message || err); }
      spend += spent; totalSpend += spent;
      const ok = free ? null : !error && checkExpect(c.expect, answer);
      if (ok) correct++; else wrong.push(answer || `ERROR ${error}`);
      out.write(JSON.stringify({ case: c.name, sections: names, i, q: c.q, answer, ok, usage, spend: spent, error }) + '\n');
    });
    results.push({ name: c.name, sections: names, correct, total: repeats, spend, wrong });
  }
  out.end();

  console.log(`${'case'.padEnd(30)} ${'sections'.padEnd(32)} n/N    $`);
  for (const r of results) console.log(`${r.name.padEnd(30)} ${r.sections.join(',').padEnd(32)} ${String(r.correct).padStart(2)}/${r.total}  $${r.spend.toFixed(4)}`);
  console.log('');
  for (const r of results) for (const w of r.wrong) console.log(`${r.name}: "${w}"`);
  console.log(`\ntotal spend $${totalSpend.toFixed(3)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}

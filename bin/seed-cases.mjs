#!/usr/bin/env node
// Plan-bench cases from a steps-mode run, its S block regenerated as if the game began with a seeded plan.
// node bin/seed-cases.mjs --run <run.jsonl> --seed <seed.json> --seqs 1,11,16 --out <cases.mjs>
import fs from 'node:fs';
import path from 'node:path';
import { readRun } from '../src/core/record.mjs';
import { planTracker } from '../src/core/commander.mjs';
import { measure } from '../src/games/microrts/policy/commander.mjs';

const arg = k => { const i = process.argv.indexOf(`--${k}`); if (i < 0 || !process.argv[i + 1]) throw new Error(`--${k} is required`); return process.argv[i + 1]; };
const run = arg('run'), seed = JSON.parse(fs.readFileSync(arg('seed'), 'utf8')), seqs = arg('seqs').split(',').map(Number), out = arg('out');
const rows = readRun(run), calls = rows.filter(r => r.kind === 'call' && r.packet);
const sums = rows.filter(r => r.raw?.commander).map(r => r.raw.commander);
const cases = [];
for (const seq of seqs) {
  const sum = sums.find(s => s.seq === seq);
  if (!sum) throw new Error(`no commander seq ${seq}`);
  const t = planTracker(measure, { seed });
  for (const r of calls) if (r.n <= sum.apiPacketN) t.see(r.packet);
  for (const s of sums) if (s.seq < seq) t.set(null);
  const S = t.read();
  const pk = calls.find(r => r.n === sum.apiPacketN).packet.split('\n').map(l => (l.startsWith('N ') ? 'N none' : l)).join('\n');
  const packet = [pk, sum.feedback, S, sum.observe].filter(Boolean).join('\n');
  cases.push({ name: `seed-t${measure(pk).cycle}`, note: `${path.basename(run)} seq${seq} apiPacketN=${sum.apiPacketN}`, packet });
  console.log(`${cases.at(-1).name}\n${S}\n`);
}
fs.writeFileSync(out, `// Seeded-plan cases from ${path.basename(run)}: pass = the model wrote a new plan.\nexport const cases = ${JSON.stringify(cases, null, 2)}.map(c => ({ ...c, expect: input => Array.isArray(input.steps) && input.steps.length >= 1 }));\n`);

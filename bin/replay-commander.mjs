#!/usr/bin/env node
// Offline replay: a recorded commander run's launches (runs/*.jsonl, call rows carrying .raw.commander {seq, apiPacketN, input})
// are reconstructed and replayed against a prompt/model — the F line (feedbackLayer + expectTracker) the launch would have seen,
// plus an optional O line from a classifier observer. Reports per-call param diffs (old recorded vs new) and lever counts.
// Game-agnostic: the policy (apply/measure/describe/decide/DEFAULTS) is loaded from src/games/<run's game>/policy/ by the run's
// own config line, so any commander:<policy> run replays, not just microrts.
//
// Usage: node bin/replay-commander.mjs <run.jsonl> --prompt <file> [--model claude-sonnet-5] [--effort low]
//        [--from-seq n] [--to-seq n] [--budget 1.0] [--at] [--classifiers near,reach,trig,foe,fight,gone,econ|all]
//        [--out <base>] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, boot } from './_boot.mjs';
import { loadGameModule } from '../src/core/args.mjs';
import { readRun } from '../src/core/record.mjs';
import { feedbackLayer, expectTracker } from '../src/core/commander.mjs';
import { withMemory, buildRequest, cost, pickUsage } from '../src/core/model.mjs';

const BOOL = ['at', 'dry-run'];

const cycleOf = packet => (/^H t(\d+)/m.exec(packet) || [])[1] ?? '?';
const diffParams = (a, b) => {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
  return keys.filter(k => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).map(k => `${k} ${JSON.stringify(b?.[k])}>${JSON.stringify(a?.[k])}`);
};

function policyOf(cfg) {
  const m = /^commander:([a-z0-9_-]+)$/i.exec(cfg.model || '');
  if (!m) throw new Error(`config model "${cfg.model}" is not a commander:<policy> run`);
  if (!cfg.game) throw new Error('config line has no game');
  return { game: cfg.game, name: m[1] };
}

// simulate(rows, {apply, decide, DEFAULTS, measure, fromSeq, toSeq}) → landed calls in seq order, each {seq, apiPacketN, prevApiPacketN,
// oldInput, fb, oldExpect, since, packet, cycle, curBefore}, mirroring commanderModel: fb is the feedbackLayer args the launch saw
// (a closed window + landed when the set in force has seen no decisions), oldExpect the recorded model's own plan/grade (measure given),
// since the packets after the prior launch up to this one, curBefore the params in force at launch.
export function simulate(rows, { apply, decide, DEFAULTS, measure = null, fromSeq = 0, toSeq = Infinity } = {}) {
  const calls = rows.filter(r => r.kind === 'call').sort((a, b) => a.n - b.n);
  const ok = c => c?.input && !c.error;
  const byApiPacketN = new Map();
  for (const R of calls) { const c = R.raw?.commander; if (ok(c)) byApiPacketN.set(c.apiPacketN, c); }
  const track = measure ? expectTracker(measure) : null;
  let cur = DEFAULTS, prev = null, setSeq = null, sinceN = 0, differed = 0, last = null, closed = null, prevLaunch = 0;
  const results = [];
  let pending = [];
  for (const R of calls) {
    const landing = R.raw?.commander;
    if (ok(landing)) {
      const was = cur;
      cur = apply(landing.input, cur);
      if (setSeq !== null && sinceN > 0) closed = { setSeq, sinceN, prev, cur: was, differed, last };
      prev = was; setSeq = landing.seq; sinceN = 0; differed = 0; last = null;
      track?.set(landing.input.expect, landing.input.plan);
    }
    track?.see(R.packet);
    pending.push(R.packet);
    const launched = byApiPacketN.get(R.n);
    if (launched) {
      const fb = sinceN === 0 && closed ? { ...closed, landed: { setSeq, prev, cur } } : { setSeq, sinceN, prev, cur, differed, last };
      results.push({ seq: launched.seq, apiPacketN: R.n, prevApiPacketN: prevLaunch, oldInput: launched.input, fb, oldExpect: track?.read() ?? null, since: pending, packet: R.packet, cycle: cycleOf(R.packet), curBefore: cur });
      pending = []; prevLaunch = R.n;
    }
    if (setSeq !== null) {
      sinceN++;
      if (prev && cur !== prev) {
        let wasO = null, nowO = null;
        try { wasO = decide(R.packet, prev).o; nowO = decide(R.packet, cur).o; } catch { /* unreadable packet */ }
        if (wasO !== null && wasO !== nowO) { differed++; last = { o: nowO, was: wasO }; }
      }
    }
  }
  return results.filter(r => r.seq >= fromSeq && r.seq <= toSeq).sort((a, b) => a.seq - b.seq);
}

// splitArgs(argv, booleans) → {flagArgs, positional}: flags first (a non-boolean flag takes the next token), the rest positional.
export function splitArgs(argv, booleans = []) {
  const flagArgs = [], positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    flagArgs.push(a);
    if (!a.includes('=') && !booleans.includes(a.slice(2)) && i + 1 < argv.length) flagArgs.push(argv[++i]);
  }
  return { flagArgs, positional };
}

async function callNew({ client, model, system, tool, toolDescription, effort, message, price }) {
  const req = buildRequest({ model, system, tool, toolName: 'plan', toolDescription, thinking: 'adaptive', effort, reply: 'tool', packet: message });
  const res = await client.messages.create(req);
  const tu = (res.content || []).find(b => b.type === 'tool_use');
  const usage = pickUsage(res.usage);
  return { input: tu?.input ?? null, usage, spend: cost(usage, price) };
}

async function main() {
  const { flagArgs, positional } = splitArgs(process.argv.slice(2), BOOL);
  const file = positional[0];
  if (!file) { console.error('usage: replay-commander <run.jsonl> --prompt <file> [--model M] [--effort E] [--from-seq n] [--to-seq n] [--budget 1.0] [--at] [--classifiers a,b|all] [--out base] [--dry-run]'); process.exit(64); }
  const { flags } = await boot(flagArgs, { booleans: BOOL });
  if (!flags.prompt) throw new Error('--prompt is required');

  const rows = readRun(file);
  const cfg = rows[0];
  if (cfg.kind !== 'config') throw new Error('line 1 is not the config');
  const { game, name } = policyOf(cfg);
  const policyMod = await loadGameModule(game, `policy/${name}.mjs`);
  const cmd = await loadGameModule(game, 'policy/commander.mjs');
  const { DEFAULTS, decide } = policyMod;
  const { apply, tool: baseTool, toolDescription, measure, describe } = cmd;
  const tool = cfg.memory > 0 ? withMemory(baseTool, cfg.memory) : baseTool;

  const model = flags.model || 'claude-sonnet-5';
  const prices = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/prices.json'), 'utf8'));
  const price = prices[model];
  if (!price) throw new Error(`no price for "${model}" in config/prices.json`);
  const effort = flags.effort || 'low';
  const system = fs.readFileSync(path.resolve(flags.prompt), 'utf8');

  let observer = null;
  if (flags.classifiers) {
    if (!cmd.createObserver) throw new Error(`${game} policy/commander.mjs has no createObserver`);
    observer = cmd.createObserver({ classifiers: String(flags.classifiers) });
  }

  const calls = simulate(rows, { apply, decide, DEFAULTS, fromSeq: flags.fromSeq ?? 0, toSeq: flags.toSeq ?? Infinity });
  const track = expectTracker(measure);
  if (calls.length) for (const R of rows) if (R.kind === 'call' && R.packet && R.n <= calls[0].prevApiPacketN) { track.see(R.packet); observer?.see(R.packet); }   // history before --from-seq
  process.stderr.write(`${path.basename(file)}: ${calls.length} commander calls to replay\n`);

  const runBase = path.basename(file, '.jsonl');
  const outBase = flags.out || path.join(ROOT, 'runs', `replay-${runBase}`);
  const dryRun = !!flags.dryRun;
  const budget = Number(flags.budget ?? 1.0);
  const AT = !!flags.at;

  let client = null;
  if (!dryRun) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic(); }

  let totalSpend = 0, mine = null;
  const results = [];
  let out = null;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(path.resolve(outBase)), { recursive: true });
    out = fs.createWriteStream(`${outBase}.out`);
    out.on('error', err => { process.stderr.write(`out: ${err.message}\n`); process.exitCode = 1; });
  }

  for (const c of calls) {
    const oldParams = apply(c.oldInput, c.curBefore);
    for (const pk of c.since) track.see(pk);
    if (observer) for (const pk of c.since) observer.see(pk);
    if (!mine) mine = c.curBefore;
    let at = null; if (AT) { try { at = describe(c.packet, mine); } catch { at = null; } }
    const F = feedbackLayer({ ...c.fb, expect: track.read(), at });
    let O = null;
    if (observer) { try { O = observer.read(mine, { expect: track.current?.() ?? null }); } catch { O = null; } }
    const message = `${c.packet}\n${F}${O ? `\n${O}` : ''}`;

    if (dryRun) {
      console.log(`--- seq${c.seq} t${c.cycle}\nF: ${F}${O ? `\nO: ${O}` : ''}\n`);
      continue;
    }

    let res;
    try { res = await callNew({ client, model, system, tool, toolDescription, effort, message, price }); }
    catch (err) { process.stderr.write(`seq ${c.seq}: ERROR ${err.message}\n`); continue; }
    track.set(res.input?.expect, res.input?.plan);
    totalSpend += res.spend;
    const newParams = res.input ? apply(res.input, c.curBefore) : null;
    if (newParams) mine = newParams;
    const rec = {
      seq: c.seq, cycle: c.cycle, F, O,
      oldDiff: diffParams(oldParams, c.curBefore), newDiff: newParams ? diffParams(newParams, c.curBefore) : ['NO ANSWER'],
      oldPlan: c.oldInput.plan ?? null, newPlan: res.input?.plan ?? null,
      usage: res.usage, spend: res.spend, cumSpend: totalSpend,
    };
    results.push(rec);
    out.write(JSON.stringify(rec) + '\n');
    process.stderr.write(`seq ${c.seq} t${c.cycle}  $${res.spend.toFixed(4)}  cum $${totalSpend.toFixed(3)}\n`);
    if (totalSpend >= budget) { process.stderr.write(`budget hit ($${totalSpend.toFixed(3)}) after seq ${c.seq}\n`); break; }
  }
  if (out) out.end();
  if (dryRun) process.exit(0);

  console.log(`\nreplayed ${results.length} calls, total spend $${totalSpend.toFixed(3)}\n`);
  for (const r of results) {
    console.log(`--- seq${r.seq} t${r.cycle}`);
    console.log(`F: ${r.F}${r.O ? `\nO: ${r.O}` : ''}`);
    console.log(`old diff: ${r.oldDiff.join(' ') || 'none'}   | old plan: ${r.oldPlan}`);
    console.log(`new diff: ${r.newDiff.join(' ') || 'none'}   | new plan: ${r.newPlan}`);
  }

  const leverOf = diff => (diff.length ? diff[0].split(' ')[0] : 'none');
  const leverCounts = {};
  let sameLever = 0, diffLever = 0;
  for (const r of results) {
    const oldL = leverOf(r.oldDiff), newL = leverOf(r.newDiff);
    leverCounts[oldL] = leverCounts[oldL] || { old: 0, new: 0 }; leverCounts[oldL].old++;
    leverCounts[newL] = leverCounts[newL] || { old: 0, new: 0 }; leverCounts[newL].new++;
    if (oldL === newL) sameLever++; else diffLever++;
  }
  console.log('\n=== summary ===');
  console.log('lever counts (old vs new):');
  console.log('param        old  new');
  for (const k of Object.keys(leverCounts).sort()) console.log(`${k.padEnd(12)} ${String(leverCounts[k].old).padStart(3)}  ${String(leverCounts[k].new).padStart(3)}`);
  console.log(`same lever: ${sameLever}  different lever: ${diffLever}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}

#!/usr/bin/env node
// Offline rehearsal: fixtures → encode → assemble → real model call → the pilot's order pipeline, send stubbed.
// node bin/rehearse.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game12-sonnet.md [--pick 1,7,42] [--every 3] [--packet-max 600] [--thinking adaptive|off] [--effort low] [--slim] [--<game>-* …]
// --slim renders every packet in its off-cadence form (--full-every 5, n=2): the A/B for packet ablation on fixed states.
// Sticky-repeat memory lives in the adapter's send, which is never called here, so `dropped:repeat` cannot occur.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sha, boot, modelFor } from './_boot.mjs';
import { loadAdapterModule, parseArgs } from '../src/core/args.mjs';
import { realClock } from '../src/core/clock.mjs';
import { assemble } from '../src/core/packet.mjs';
import { applyOrders, lastOrdersOf } from '../src/core/pilot.mjs';
import { rankAndCollapse } from '../src/core/digest.mjs';

const pre = await boot(process.argv.slice(2), { booleans: ['dry', 'slim', 'stream'] });
const game = pre.flags.game || 'ashfall';
const { flags, gameOpts } = parseArgs(process.argv.slice(2), { booleans: ['dry', 'slim', 'stream'], game });
const model = flags.model || process.env.QUICKDRAW_MODEL || 'claude-sonnet-5';
const promptFile = flags.prompt || path.join(ROOT, `prompts/${game}/game12-sonnet.md`);
const fixDir = flags.fixtures || path.join(ROOT, `test/games/${game}/fixtures`);
const files = fs.readdirSync(fixDir).filter(f => f.endsWith('.json')).sort();
const every = flags.every ?? 3;
const picks = flags.pick ? String(flags.pick).split(',').map(Number) : files.map((_, i) => i + 1).filter(n => n % every === 1);

const clock = realClock();
const mod = await loadAdapterModule(game);
const adapter = mod.createAdapter(process.env, { ...gameOpts, clock, open: true, host: 'ws://127.0.0.1:1' });
const system = fs.readFileSync(promptFile, 'utf8');
const short = s => sha(s).slice(0, 12);
console.error(`model ${model} prompt ${short(system)} schema ${short(JSON.stringify(adapter.tool))} fixtures ${picks.length}`);
const callModel = flags.dry
  ? async () => ({ act: false, orders: [], note: null, usage: null, stop: 'dry', latencyMs: 0, cost: 0 })
  : await modelFor({ adapter, game, model, system, thinking: flags.thinking, effort: flags.effort, reply: flags.reply, stream: flags.stream, decisionDeadlineMs: flags.decisionDeadline ?? 20000, clock });   // cold every call: no cache warm-up here
const snap = (fx, idx) => ({ header: { lifecycle: 'active', phaseNative: 'running', clocks: { game: fx.state.time }, gameId: '1', seat: 'team0' }, native: fx.state, t: 0, idx });
const { toTrigger } = await import(`../src/games/${game}/events.mjs`);
let total = 0, lastOrders = [];
const out = [];
for (const n of picks) {
  const fx = JSON.parse(fs.readFileSync(path.join(fixDir, files[n - 1]), 'utf8'));
  const prev = n > 1 ? JSON.parse(fs.readFileSync(path.join(fixDir, files[n - 2]), 'utf8')) : null;
  const triggers = rankAndCollapse(fx.events.map(ev => ({ ...toTrigger(ev, fx.state.team), t: 0 })), { classes: adapter.meta.classes });
  if (!triggers.length) triggers.push({ cls: 'heartbeat', key: 'hb', t: 0 });
  const state = snap(fx, n);
  const layers = adapter.encode({ state, prevDecisionState: prev && snap(prev, n - 1), triggers, lastOrders });
  const pkt = assemble(layers, { maxTokens: flags.packetMax ?? 600, divisor: mod.divisor ?? 3.5, fullEvery: flags.slim ? 5 : (flags.fullEvery ?? 0), n: flags.slim ? 2 : n });
  const res = await callModel({ packet: pkt.text });
  const orders = res.act ? res.orders : [];
  const { keep, dropped } = applyOrders({ adapter, orders, state, clock });
  lastOrders = lastOrdersOf(keep, keep.map(() => ({ ok: true })), dropped);   // send is stubbed: every kept order "succeeds"
  total += res.cost || 0;
  out.push({ fixture: files[n - 1], est: pkt.estTokens, stop: res.stop, latencyMs: res.latencyMs, usage: res.usage, act: res.act, note: res.note, sent: keep, dropped, cost: res.cost });
  console.log(`\n=== ${files[n - 1]} (${pkt.estTokens} est tokens)\n${pkt.text}\n--- ${res.stop} ${res.latencyMs} ms out=${res.usage?.output_tokens ?? '-'} cacheRead=${res.usage?.cache_read_input_tokens ?? '-'} cacheWrite=${res.usage?.cache_creation_input_tokens ?? '-'} act=${res.act}${res.note ? ' note: ' + res.note : ''}`);
  for (const c of keep) console.log('  send', JSON.stringify(c));
  for (const d of dropped) console.log('  drop', d.reason, JSON.stringify(d.cmd));
  if (res.error) console.log('  error', res.error);
}
const lat = out.map(r => r.latencyMs).sort((a, b) => a - b), outs = out.map(r => r.usage?.output_tokens ?? 0).sort((a, b) => a - b);
console.error(`\n${out.length} calls, median latency ${lat[Math.floor(lat.length / 2)]} ms, median output ${outs[Math.floor(outs.length / 2)]} tokens, cache hits ${out.filter(r => r.usage?.cache_read_input_tokens > 0).length}/${out.length}, cost $${total.toFixed(4)}`);
if (flags.out) fs.writeFileSync(flags.out, JSON.stringify({ model, prompt: short(system), slim: !!flags.slim, gameOpts, rows: out }, null, 1));

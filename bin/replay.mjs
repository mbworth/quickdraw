#!/usr/bin/env node
// node bin/replay.mjs <run.jsonl> <n> : re-runs encode + assemble for decision n from its refs and diffs the packet.
// Proves encode is a pure function of the recorded refs; it cannot prove the API saw the recorded packet.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAdapterModule } from '../src/core/args.mjs';
import { assemble } from '../src/core/packet.mjs';
import { readRun } from '../src/core/record.mjs';
import { realClock } from '../src/core/clock.mjs';

const snapOf = (rows, ref) => { const r = rows[ref - 1]; if (!r || r.kind !== 'state') throw new Error(`ref ${ref} is not a state line`); return { header: r.header, native: r.native, t: r.st, idx: r.idx }; };

// replayDecision(rows, n, adapter, cfg) → {recorded, replayed, same, layers, kept}
export function replayDecision(rows, n, adapter, cfg) {
  const call = rows.find(r => r.kind === 'call' && r.n === n);
  if (!call) throw new Error(`no call line for decision ${n}`);
  const state = snapOf(rows, call.stateRef);
  const prevDecisionState = call.prevDecisionRef ? snapOf(rows, call.prevDecisionRef) : null;
  const layers = adapter.encode({ state, prevDecisionState, triggers: call.triggers, lastOrders: call.lastOrders, pending: call.pending || [] });
  const pkt = assemble(layers, { maxTokens: cfg.packetMax, divisor: cfg.divisor, fullEvery: cfg.fullEvery || 0, n });
  return { recorded: call.packet, replayed: pkt.text, same: pkt.text === call.packet, layers, kept: pkt.kept.map(k => k.name) };
}

export async function replayFile(file, n) {
  const rows = readRun(file);
  const cfg = rows[0];
  if (cfg.kind !== 'config') throw new Error('line 1 is not the config');
  const mod = await loadAdapterModule(cfg.game);
  const adapter = mod.createAdapter({}, { ...(cfg.gameOpts || {}), clock: realClock() });
  const ns = n === 'all' ? rows.filter(r => r.kind === 'call' && r.packet != null).map(r => r.n) : [Number(n)];   // skipped calls carried a packet too
  return ns.map(k => ({ n: k, ...replayDecision(rows, k, adapter, cfg) }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [file, n = 'all'] = process.argv.slice(2);
  if (!file) { console.error('usage: replay <run.jsonl> [n|all]'); process.exit(64); }
  const out = await replayFile(file, n);
  let bad = 0;
  for (const r of out) {
    if (r.same) { if (n !== 'all') console.log(r.replayed); continue; }
    bad++;
    console.log(`decision ${r.n}: DIFFERS\n--- recorded\n${r.recorded}\n--- replayed\n${r.replayed}`);
  }
  console.error(`${out.length - bad}/${out.length} packets reproduced byte for byte`);
  process.exit(bad ? 1 : 0);
}

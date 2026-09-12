#!/usr/bin/env node
// node bin/layers.mjs <run.jsonl>… : tokens per packet layer and repeat share, from replayed layers (no format change).
// Repeat share = lines of this packet that appear verbatim in the previous decision's packet. Decision 1 excluded.
// Layers the assembler dropped (budget or --full-every) count for `present` only; tokens and shares are over packets that carried them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRun } from '../src/core/record.mjs';
import { estTokens } from '../src/core/packet.mjs';
import { replayFile } from './replay.mjs';
import { pctl } from './pace.mjs';

const r1 = x => (x == null ? null : Math.round(x * 10) / 10);
const linesOf = l => [l.text, ...(l.lines || []).map(x => x.text)].filter(Boolean);

// layerStats(replays, divisor) → {packetP50, repeatShareP50, layers:{name:{tokP50, share, constant, repeat}}}
// share = median of layer tokens / packet est tokens; constant = share of decisions where the layer's text equals
// the previous decision's; repeat = share of the layer's lines present in the previous decision's same layer.
export function layerStats(replays, divisor) {
  const per = {}; const packets = []; const repeats = [];
  let prev = null;
  for (const r of replays) {
    const kept = r.kept ? new Set(r.kept) : null;
    const cur = new Map(r.layers.filter(l => !kept || kept.has(l.name)).map(l => [l.name, linesOf(l)]));
    const pktLines = r.recorded.split('\n');
    const pktTok = estTokens(r.recorded, divisor);
    if (prev) {
      packets.push(pktTok);
      const prevSet = new Set(prev.recorded.split('\n'));
      repeats.push(pktLines.filter(x => prevSet.has(x)).length / pktLines.length);
      for (const [name, lines] of cur) {
        const p = per[name] ??= { tok: [], share: [], constant: 0, repeat: [], n: 0, present: 0 };
        p.present++;
        const t = estTokens(lines.join('\n'), divisor);
        const pl = prev.map.get(name) || [];
        p.n++; p.tok.push(t); p.share.push(t / pktTok);
        if (lines.join('\n') === pl.join('\n')) p.constant++;
        if (lines.length) { const s = new Set(pl); p.repeat.push(lines.filter(x => s.has(x)).length / lines.length); }
      }
    }
    prev = { recorded: r.recorded, map: cur };
  }
  const layers = {};
  for (const [name, p] of Object.entries(per)) layers[name] = { present: r1((100 * p.present) / packets.length), tokP50: pctl(p.tok, 0.5), share: r1(100 * pctl(p.share, 0.5)), constant: r1((100 * p.constant) / p.n), repeat: r1(100 * pctl(p.repeat, 0.5)) };
  return { decisions: packets.length, packetP50: pctl(packets, 0.5), repeatShareP50: r1(100 * pctl(repeats, 0.5)), layers };
}

export async function layersFile(file) {
  const rows = readRun(file);
  const divisor = rows[0]?.divisor ?? 3.5;
  const replays = (await replayFile(file, 'all')).filter(r => r.n > 1);
  return layerStats(replays, divisor);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: layers <run.jsonl>…'); process.exit(64); }
  for (const f of files) {
    const s = await layersFile(f);
    console.log(`${path.basename(f)}: ${s.decisions} decisions, packet est p50 ${s.packetP50}, repeat lines p50 ${s.repeatShareP50}%`);
    console.log('layer        present%  tokP50  share%  const%  repeat%');
    for (const [name, l] of Object.entries(s.layers)) console.log(`${name.padEnd(12)} ${String(l.present).padStart(8)} ${String(l.tokP50).padStart(7)} ${String(l.share).padStart(7)} ${String(l.constant).padStart(7)} ${String(l.repeat).padStart(8)}`);
  }
}

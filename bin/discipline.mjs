#!/usr/bin/env node
// node bin/discipline.mjs <run.jsonl>… : decision quality as adherence to the frozen prompt's own rules, from run files only.
// Rules scored (prompts/ashfall/game15-sonnet.md): attack with the whole ball at ≥ 8 once the anchor turret is up; spend the
// bank; keep harvesters busy. Compares harness configs on the same prompt without a live game.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRun } from '../src/core/record.mjs';
import { answered } from '../src/core/model.mjs';
import { pctl } from './pace.mjs';

const r1 = x => (x == null ? null : Math.round(x * 10) / 10);
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const isBld = t => ['core', 'barracks', 'depot', 'turret', 'wall', 'armory', 'sensor'].includes(t);
const finished = e => e.progress === undefined;

export function discipline(rows) {
  const cfg = rows[0]?.kind === 'config' ? rows[0] : {};
  const states = rows.filter(r => r.kind === 'state' && r.native?.started);
  const calls = new Map(rows.filter(r => r.kind === 'call').map(c => [c.n, c]));
  const decisions = rows.filter(r => r.kind === 'decision');
  const done = rows.find(r => r.kind === 'done');
  const base = states[0]?.native.myBase || { x: 0, z: 0 };
  const enemy = { x: -base.x, z: -base.z };   // the prompt's mirror rule
  const stateAt = n => { const c = calls.get(n); const s = c && rows[c.stateRef - 1]; return s?.kind === 'state' ? s.native : null; };
  const army = s => (s.mine || []).filter(e => !isBld(e.type) && e.type !== 'worker').length;
  const turretUp = s => (s.mine || []).some(e => e.type === 'turret' && finished(e));
  const unitsIn = (c, s) => {   // how many units an order names: ids, or the selector's size in that state
    const u = c.units || []; let n = 0;
    for (const v of u) { if (typeof v === 'number') n++; else if (v === 'army' || v === 'all') n += army(s); else if (v === 'troopers') n += (s.mine || []).filter(e => e.type === 'trooper').length; else if (v === 'idle') n += (s.mine || []).filter(e => e.state === 'idle' && !isBld(e.type) && e.type !== 'worker').length; }
    return n;
  };
  // pushes: attack-moves whose destination is nearer the enemy base than mine
  const pushes = [];
  for (const d of decisions) {
    const s = stateAt(d.n); if (!s) continue;
    for (const c of d.sent) if (c.cmd === 'move' && c.attackMove && d2(c, enemy) < d2(c, base)) pushes.push({ n: d.n, gt: s.time, units: unitsIn(c, s), army: army(s), turret: turretUp(s) });
  }
  const first = pushes[0] || null;
  const firstBall = pushes.find(p => p.units >= 8) || null;
  const pieces = pushes.filter(p => p.units < 8 && (!firstBall || p.n < firstBall.n)).length;
  const firstOf = type => { const s = states.find(x => (x.native.mine || []).some(e => e.type === type && finished(e))); return s ? r1(s.native.time) : null; };
  const after1 = states.filter(s => s.native.time >= 60);
  const ore = after1.map(s => s.native.ore);
  const workers = s => (s.mine || []).filter(e => e.type === 'worker');
  const idleShare = after1.map(s => { const w = workers(s.native); return w.length ? w.filter(e => e.state === 'idle').length / w.length : 0; });
  const at = min => { const s = states.find(x => x.native.time >= min * 60); return s ? workers(s.native).length : null; };
  const returned = [...calls.values()].filter(c => !c.skipped && answered(c.stop));
  const byN = new Map(decisions.map(d => [d.n, d]));
  return {
    gameId: cfg.gameId, promptSha: cfg.promptSha256?.slice(0, 8), fullEvery: cfg.fullEvery || 0, gameOpts: Object.keys(cfg.gameOpts || {}).filter(k => k !== 'concedeStale' && cfg.gameOpts[k]).join(','), thinking: cfg.thinking,
    outcome: done?.outcome?.won == null ? 'stopped' : done.outcome.won ? 'win' : 'loss', minutes: done?.duration != null ? r1(done.duration) : null,
    barracksAt: firstOf('barracks'), turretAt: firstOf('turret'),
    firstPushAt: first ? r1(first.gt) : null, firstPushUnits: first?.units ?? null, firstPushArmy: first?.army ?? null, firstPushTurret: first?.turret ?? null,
    firstBallAt: firstBall ? r1(firstBall.gt) : null, piecesBeforeBall: pieces, pushes: pushes.length,
    oreP50: pctl(ore, 0.5), oreOver120: ore.length ? r1((100 * ore.filter(o => o >= 120).length) / ore.length) : null,
    idleWorkerPct: r1(100 * (idleShare.reduce((a, b) => a + b, 0) / (idleShare.length || 1))), workersAt2: at(2), workersAt4: at(4), workersAt6: at(6),
    noopPct: returned.length ? r1((100 * returned.filter(c => byN.get(c.n) && !byN.get(c.n).act).length) / returned.length) : null,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: discipline <run.jsonl>…'); process.exit(64); }
  const out = files.map(f => discipline(readRun(f)));
  const cols = Object.keys(out[0]);
  console.log(cols.join('\t'));
  for (const o of out) console.log(cols.map(k => (o[k] === null || o[k] === undefined ? '-' : String(o[k]))).join('\t'));
}

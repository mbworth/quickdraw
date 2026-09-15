#!/usr/bin/env node
// node bin/campaign.mjs --games N [--ab reserve=danger,contact,loss] [--out runs/campaign/<name>.json] [--first on|off] [--pause ms] [--report] -- <pilot flags>
// Runs N live games in sequence on the pilot flags after `--`, alternating the A/B flag on/off game by game, and keeps a state file
// so a stopped campaign resumes where it left off. After each game: pace summary, the high-class wait share, a games.md row
// (`notes/<game>/games.md`, next number), and the per-arm table. Stops on the pilot's stop-file exit (2), a signal (130), or a crash.
// --report prints the table for an existing state file and exits. Cost ≈ $1 a game.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT } from './_boot.mjs';
import { parseArgs } from '../src/core/args.mjs';
import { readRun } from '../src/core/record.mjs';
import { summarize, row, pctl } from './pace.mjs';

const r1 = x => (x == null ? null : Math.round(x * 10) / 10);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

// arms(n, first) → ['on','off','on',…]: game i takes arm i % 2, starting with `first`.
export const arms = (n, first = 'on') => Array.from({ length: n }, (_, i) => ((i % 2 === 0) === (first === 'on') ? 'on' : 'off'));

// armFlags(base, ab, arm) → the pilot argv for one game: base flags plus `--<flag> <value>` when the arm is on.
export function armFlags(base, ab, arm) { return ab && arm === 'on' ? [...base, `--${ab.flag}`, ab.value] : [...base]; }

// parseAb('reserve=danger,contact,loss') → {flag, value, classes}; `classes` is what the wait metric counts as high-class.
export function parseAb(s) { if (!s) return null; const eq = s.indexOf('='); if (eq < 0) throw new Error('--ab needs flag=value'); return { flag: s.slice(0, eq), value: s.slice(eq + 1), classes: s.slice(eq + 1).split(',') }; }

// highClassWait(rows, classes) → event-led calls led by one of `classes` (call 1 and derived triggers excluded): how many, the share
// that waited behind a call in flight, and their wait p50/p90. waitMs is event arrival → tick: under --event-tick the tick is immediate,
// so any wait is time behind a call in flight; without it the 500 ms push wait sits under 600 ms. The mechanism check for --reserve.
export function highClassWait(rows, classes, behindMs = null) {
  const cfg = rows[0]?.kind === 'config' ? rows[0] : {};
  const cut = behindMs ?? (cfg.eventTick ? 0 : 600);
  const calls = rows.filter(r => r.kind === 'call' && r.n > 1 && r.latency && (r.anchor ?? 'event') === 'event' && !r.triggers?.[0]?.derived && classes.includes(r.triggers?.[0]?.cls));
  const waits = calls.map(c => c.latency.waitMs);
  const behind = waits.filter(w => w > cut).length;
  return { calls: calls.length, behind, behindPct: pct(behind, calls.length), waitP50: pctl(waits, 0.5), waitP90: pctl(waits, 0.9) };
}

// wilson(wins, n) → [lo, hi] as percentages, 95%.
export function wilson(wins, n, z = 1.96) {
  if (!n) return [null, null];
  const p = wins / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.round((100 * (c - h)) / d), Math.round((100 * (c + h)) / d)];
}

// insertRow(md, row) → games.md with the row after the last row of the FIRST games table (prose and other tables follow it).
export function insertRow(md, row) {
  const lines = md.split('\n'); let last = -1;
  for (let i = 0; i < lines.length; i++) { if (/^\| \d+/.test(lines[i])) last = i; else if (last >= 0 && lines[i].trim() && !lines[i].startsWith('|')) break; }
  if (last < 0) return md + (md.endsWith('\n') || !md ? '' : '\n') + row + '\n';
  lines.splice(last + 1, 0, row); return lines.join('\n');
}

// nextGameNumber(md) → one past the largest leading `| N |` in games.md.
export function nextGameNumber(md) { let max = 0; for (const m of md.matchAll(/^\| (\d+)(?:-\d+)? \|/gm)) max = Math.max(max, Number(m[1])); return max + 1; }

// report(state) → per-arm table: games, wins, win rate with its 95% Wilson interval (±26 points at 10 games: a guard, not the decision
// metric; the pooled high-class wait share is), median reaction/first-order p50, high-class wait share pooled over calls, cost.
export function report(state) {
  const done = state.games.filter(finished), stopped = state.games.filter(g => g.summary && !finished(g)).length;
  const lines = [`campaign ${state.name}: ${done.length}/${state.n} games${stopped ? `, ${stopped} stopped (rerun on resume)` : ''}${state.ab ? `, A/B --${state.ab.flag} ${state.ab.value}` : ''}`];
  const cols = ['arm', 'games', 'wins', 'win%', '95%', 'react p50', 'first p50', 'hi calls', 'hi behind', 'hi wait p50', 'usd'];
  const w = [5, 6, 5, 5, 9, 10, 10, 9, 10, 12, 7];
  const line = cells => cells.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c ?? '-').padStart(w[i]))).join(' ');
  lines.push(line(cols));
  for (const arm of state.ab ? ['on', 'off'] : ['all']) {
    const gs = done.filter(g => !state.ab || g.arm === arm);
    const wins = gs.filter(g => g.summary.outcome?.won).length, n = gs.length, [lo, hi] = wilson(wins, n);
    const med = k => r1(pctl(gs.map(g => g.summary[k]).filter(x => x != null), 0.5));
    const hw = gs.map(g => g.hi).filter(Boolean);
    const hiCalls = hw.reduce((s, h) => s + h.calls, 0), hiBehind = hw.reduce((s, h) => s + (h.behind ?? Math.round((h.behindPct || 0) * h.calls / 100)), 0);   // pooled over calls, not a median of per-game shares
    lines.push(line([arm, n, wins, pct(wins, n), n ? `${lo}–${hi}` : '-', med('reactionP50'), med('firstP50'), hiCalls || '-',
      hiCalls ? pct(hiBehind, hiCalls) + '%' : '-', hw.length ? pctl(hw.map(h => h.waitP50), 0.5) : '-', r1(gs.reduce((s, g) => s + (g.summary.usd || 0), 0))]));
  }
  for (const g of done) lines.push(`  ${g.i + 1}. ${g.arm} game ${g.gameNumber} (hub ${g.summary.gameId}): ${g.summary.outcome?.won ? 'win' : g.summary.outcome == null ? 'stopped' : 'loss'} ${g.summary.minutes} min, react p50 ${g.summary.reactionP50 ?? '-'}, hi behind ${g.hi?.behindPct ?? '-'}%, $${g.summary.usd}`);
  return lines.join('\n');
}

// A game counts only when the hub decided it; a stopped or crashed one is rerun on resume.
export const finished = g => typeof g?.summary?.outcome?.won === 'boolean' || g?.summary?.outcome?.draw === true;   // a decided game: won, lost, or a draw (MicroRTS at max_cycles)

const save = (file, state) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(state, null, 1)); };

// runPilot(argv, log) → {code, run}: one pilot as a child, stderr to the log file, the run path from its done line.
export function runPilot(argv, logFile, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const out = fs.openSync(logFile, 'a');
    const child = spawn(process.execPath, [path.join(ROOT, 'bin/pilot.mjs'), ...argv], { stdio: ['ignore', out, 'pipe'] });
    let tail = '';
    child.stderr.on('data', d => { fs.writeSync(out, d); tail = (tail + d).slice(-4000); });
    const onSig = () => child.kill('SIGINT');
    signal?.addEventListener('abort', onSig, { once: true });
    child.on('error', reject);
    child.on('exit', code => { fs.closeSync(out); signal?.removeEventListener('abort', onSig); resolve({ code, run: /run=(\S+)/.exec(tail)?.[1] ?? null }); });
  });
}

export async function main(argv = process.argv.slice(2)) {
  const sep = argv.indexOf('--');
  const own = sep < 0 ? argv : argv.slice(0, sep), base = sep < 0 ? [] : argv.slice(sep + 1);
  const { flags } = parseArgs(own, { booleans: ['report', 'help'] });
  if (flags.help || (!flags.report && (!flags.games || !base.length))) { console.error('usage: campaign --games N [--ab flag=value] [--out state.json] [--first on|off] [--pause ms] [--report] -- <pilot flags>'); return 64; }
  const abArg = parseAb(flags.ab);
  const name = flags.name ?? (abArg ? abArg.flag : 'baseline');
  const file = flags.out ?? path.join(ROOT, 'runs/campaign', `${name}.json`);
  const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { name, n: flags.games, ab: abArg, base, first: flags.first ?? 'on', games: [] };
  const ab = state.ab;   // a resumed campaign keeps its own A/B and base flags; the command line cannot re-arm it halfway
  if (abArg && JSON.stringify(abArg) !== JSON.stringify(ab)) { console.error(`campaign ${name}: state file has --ab ${ab ? `${ab.flag}=${ab.value}` : 'none'}; delete or rename it to change the A/B`); return 64; }
  if (flags.report) { console.log(report(state)); return 0; }
  if (flags.games) state.n = flags.games;
  const game = parseArgs(base, { booleans: ['event-tick', 'stream'] }).flags.game;
  const notes = path.join(ROOT, 'notes', game, 'games.md');
  const stopFile = parseArgs(base, { booleans: ['event-tick', 'stream'] }).flags.stopFile;
  const logDir = path.join(path.dirname(file), name); fs.mkdirSync(logDir, { recursive: true });
  const stopper = new AbortController();
  process.on('SIGINT', () => stopper.abort());
  const plan = arms(state.n, state.first);
  for (let i = 0; i < state.n; i++) {
    if (finished(state.games.find(g => g.i === i))) continue;   // any unfinished index is (re)run, gaps included
    if (stopper.signal.aborted || (stopFile && fs.existsSync(stopFile))) { console.error(`campaign: stopped before game ${i + 1}`); break; }
    const arm = plan[i], pargv = armFlags(state.base, ab, arm);
    const gameNumber = fs.existsSync(notes) ? nextGameNumber(fs.readFileSync(notes, 'utf8')) : null;
    console.error(`campaign ${name}: game ${i + 1}/${state.n}, arm ${arm}${ab ? ` (--${ab.flag} ${arm === 'on' ? ab.value : 'off'})` : ''}, games.md ${gameNumber ?? '-'}`);
    const logFile = path.join(logDir, `game-${String(i + 1).padStart(2, '0')}-${arm}.log`);
    const entry = { i, arm, gameNumber, startedAt: new Date().toISOString(), argv: pargv, log: logFile };
    state.games = state.games.filter(g => g.i !== i).concat(entry).sort((a, b) => a.i - b.i); save(file, state);
    const { code, run } = await runPilot(pargv, logFile, { signal: stopper.signal });
    entry.exitCode = code; entry.run = run;
    if (run && fs.existsSync(run)) {
      const rows = readRun(run);
      entry.summary = summarize(rows);
      if (ab) entry.hi = highClassWait(rows, ab.classes);
      const tag = ab ? `campaign ${i + 1}/${state.n}, **--${ab.flag} ${arm}**` : `campaign ${i + 1}/${state.n}`;
      entry.row = row(entry.summary, gameNumber ?? '?').replace(/\| ([^|]*)\|$/, (m, notesCell) => `| ${tag}${entry.hi?.calls ? ` (hi-class calls behind in-flight ${entry.hi.behindPct}%, wait p50 ${entry.hi.waitP50} ms)` : ''}: ${notesCell.trim()} |`);
      if (gameNumber != null && finished(entry)) fs.writeFileSync(notes, insertRow(fs.readFileSync(notes, 'utf8'), entry.row));
      console.error(entry.row);
    }
    save(file, state);
    console.error(report(state));
    if (code === 2 || code === 130 || code == null || code >= 64 || !finished(entry)) { console.error(`campaign: pilot exited ${code}${finished(entry) ? '' : ' with no outcome'}, stopping`); break; }   // an undecided game (transport death, no done row) needs a look, not a silent rerun
    if (i + 1 < state.n) await new Promise(r => setTimeout(r, flags.pause ?? 5000));
  }
  console.log(report(state));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().then(c => process.exit(c), e => { console.error(e); process.exit(70); });

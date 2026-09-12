#!/usr/bin/env node
// node bin/snapshot.mjs <run.jsonl> (--row R | --n N) --out file.json : one scrubbed fixture {t, state, events} from a run.
// --row R takes state line R (1-based, as call.stateRef); --n N takes decision N's packet state and its trigger events.
// Same allowlist scrub as bin/record.mjs, so the result is safe to commit (bench fixtures).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../src/core/args.mjs';
import { readRun } from '../src/core/record.mjs';
import { scrubState, scrubEvent, createIdMap, strayKeys, LEAK } from '../src/games/ashfall/scrub.mjs';

export function snapshot(rows, { row = null, n = null } = {}) {
  let stateRow, events = [];
  if (n != null) {
    const call = rows.find(r => r.kind === 'call' && r.n === Number(n));
    if (!call) throw new Error(`no call for decision ${n}`);
    stateRow = rows[call.stateRef - 1];
    events = (call.triggers || []).map(t => t.native).filter(Boolean);
  } else stateRow = rows[Number(row) - 1];
  if (!stateRow || stateRow.kind !== 'state') throw new Error('not a state line');
  const ids = createIdMap();
  const fx = { t: stateRow.native.time, state: scrubState(stateRow.native, ids), events: events.map(ev => scrubEvent(ev, ids)).filter(Boolean) };
  const stray = strayKeys(fx);
  if (stray.length) throw new Error(`stray keys: ${stray.join(' ')}`);
  if (LEAK.test(JSON.stringify(fx))) throw new Error('leak pattern in fixture');
  return fx;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2), file = argv.find(a => !a.startsWith('--'));
  const { flags } = parseArgs(argv.filter(a => a !== file));
  if (!file || !flags.out || (flags.row == null && flags.n == null)) { console.error('usage: snapshot <run.jsonl> (--row R | --n N) --out file.json'); process.exit(64); }
  const fx = snapshot(readRun(file), { row: flags.row, n: flags.n });
  fs.mkdirSync(path.dirname(flags.out), { recursive: true });
  fs.writeFileSync(flags.out, JSON.stringify(fx));
  console.error(`${flags.out}: t=${Math.round(fx.t)} mine=${fx.state.mine.length} enemy=${fx.state.enemyVisible.length} events=${fx.events.length}`);
}

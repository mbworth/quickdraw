#!/usr/bin/env node
// Captures scrubbed fixtures: node bin/record.mjs --game ashfall --seconds 180 --every 5 --out test/games/ashfall/fixtures/
// Local (ASHFALL_LOCAL spawns an open hub) or live (ASHFALL_KEY + ASHFALL_HOST). Plays a fixed opening so the
// fixtures carry production, an army and contact; raw lines go to runs/, only scrubbed fixtures to --out.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, boot, safeId } from './_boot.mjs';
import { realClock } from '../src/core/clock.mjs';

const { flags } = await boot(process.argv.slice(2), { booleans: ['live'] });
const game = flags.game || 'ashfall';
if (game !== 'ashfall') { console.error('only ashfall records for now'); process.exit(64); }
const seconds = flags.seconds ?? 180, every = flags.every ?? 5, out = flags.out ?? path.join(ROOT, 'test/games/ashfall/fixtures');
const size = flags.size ?? 200;

const { connect } = await import('../src/games/ashfall/ctl.mjs');
const { makeAuth } = await import('../src/games/ashfall/auth.mjs');
const { scrubState, scrubEvent, createIdMap } = await import('../src/games/ashfall/scrub.mjs');
const { opening } = await import('../src/games/ashfall/opening.mjs');

const clock = realClock();
let hub = null, host = process.env.ASHFALL_HUB || process.env.ASHFALL_HOST || 'play.ashfallsector.com';
const live = flags.live || !process.env.ASHFALL_LOCAL;
if (!live) { const { spawnLocalHub } = await import('../src/games/ashfall/localhub.mjs'); hub = await spawnLocalHub({ port: flags.port ?? 8792, log: m => console.error('[hub]', m) }); host = hub.host; }
const auth = makeAuth({ key: live ? process.env.ASHFALL_KEY : null, name: `qd-rec-${Date.now().toString(36)}` });
const c = connect({ host, auth, clock, log: (...a) => console.error('[ctl]', ...a) });
await c.connect();
const g = await c.create({ size, opponent: 'scripted', name: 'quickdraw fixtures' });
if (!g.ok) { console.error('create failed:', g.error); process.exit(1); }
console.error(`game ${g.result.game.id} team ${g.result.team}`);
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const raw = fs.openSync(path.join(ROOT, 'runs', `record-ashfall-${safeId(g.result.game.id)}.jsonl`), 'a');
const ids = createIdMap();
let n = 0, lastFx = -Infinity, started = false;
const play = opening({ c, log: m => console.error('[opening]', m) });
c.on('event', ev => fs.writeSync(raw, JSON.stringify({ kind: 'event', t: Date.now(), ev }) + '\n'));
c.on('state', s => {
  fs.writeSync(raw, JSON.stringify({ kind: 'state', t: Date.now(), state: s }) + '\n');
  if (!s.started) return;
  if (!started) { started = true; console.error('started'); }
  play(s).catch(e => console.error('[opening]', e.message));
  if (s.time - lastFx >= every) {
    lastFx = s.time;
    const events = c.takeEvents().map(ev => scrubEvent(ev, ids)).filter(Boolean);
    const fx = { t: s.time, state: scrubState(s, ids), events };
    fs.writeFileSync(path.join(out, `${String(++n).padStart(3, '0')}-t${Math.round(s.time)}.json`), JSON.stringify(fx));
    console.error(`fixture ${n} t=${Math.round(s.time)} mine=${s.mine.length} enemy=${s.enemyVisible.length} events=${events.length}`);
  }
  if (s.time >= seconds || s.gameOver) finish();
});
await c.start();
setTimeout(finish, (seconds + 120) * 1000).unref();
async function finish() {
  console.error(`done: ${n} fixtures in ${out}`);
  try { await c.leave(); } catch {}
  c.close(); fs.closeSync(raw); hub?.stop();
  process.exit(0);
}

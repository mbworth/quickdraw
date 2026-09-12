// Q4 live checklist on a throwaway game: keyed upgrade, hello with player, create 200 vs scripted, one order
// round trip, forced terminate, rejoin by account, leave. Runs only with ASHFALL_LIVE=1 and a key; the game is conceded.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../../../src/games/ashfall/ctl.mjs';
import { makeAuth } from '../../../src/games/ashfall/auth.mjs';
import { realClock } from '../../../src/core/clock.mjs';

const LIVE = process.env.ASHFALL_LIVE === '1' && process.env.ASHFALL_KEY;
let c;
after(() => c?.close());

test('live checklist', { skip: !LIVE ? 'set ASHFALL_LIVE=1 with ASHFALL_KEY' : false, timeout: 90000 }, async () => {
  const auth = makeAuth({ key: process.env.ASHFALL_KEY });
  c = connect({ host: process.env.ASHFALL_HUB || process.env.ASHFALL_HOST, auth, clock: realClock(), log: (...a) => console.log('[ctl]', ...a) });
  const hello = await c.connect();
  assert.ok(hello.player?.id, 'keyed hello carries the player');
  console.log('player', hello.player.name, 'rating', hello.player.rating);
  const list = await c.games();
  assert.ok(list.ok, list.error);
  const mine = (list.result.games || list.result).filter(g => g.status !== 'over' && (g.seats || []).some(s => s?.player === hello.player.name));
  console.log('unfinished seats held by this account:', mine.map(g => `${g.id}:${g.status}`).join(' ') || 'none');
  if (process.env.ASHFALL_CONCEDE_STALE === '1') for (const g of mine) {   // leftovers of an earlier checklist run
    const team = g.seats.findIndex(s => s?.player === hello.player.name);
    const j = await c.join({ game: g.id, team });
    if (!j.ok) { console.log('could not rejoin', g.id, j.error); continue; }
    if (g.status === 'running') await c.concede();
    await c.leave();
    console.log('cleared seat in game', g.id);
  }
  const g = await c.create({ size: 200, opponent: 'scripted', name: 'quickdraw checklist' });
  assert.ok(g.ok, g.error);
  assert.equal(g.result.game.size, 200);
  console.log('game', g.result.game.id, 'team', g.result.team);
  const first = await new Promise(r => c.on('state', s => r(s)));
  assert.equal(first.game, g.result.game.id);
  assert.ok((await c.start()).ok);
  await new Promise(r => { const h = s => { if (s.started) { c.off('state', h); r(); } }; c.on('state', h); });
  const core = c.latest.state.mine.find(e => e.type === 'core');
  const r = await c.cmd('train', { building: core.id, type: 'worker' });
  assert.ok(r.ok, r.error);
  console.log('round trip:', r.result);
  const dc = new Promise(r => c.on('disconnect', r)), rc = new Promise(r => c.on('reconnect', r));
  c.terminate();
  await dc; await rc;
  const fresh = await new Promise(r => c.on('state', s => r(s)));
  assert.equal(fresh.game, g.result.game.id, 'rejoined by account after a forced drop');
  assert.ok(fresh.started);
  assert.equal(c.stats.rateLimited, 0);
  const cc = await c.concede();
  assert.ok(cc.ok, cc.error);
  assert.ok((await c.leave()).ok);
  console.log('conceded and left; reconnects', c.stats.reconnects, 'frames', c.stats.frames);
});

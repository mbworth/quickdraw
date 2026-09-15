import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { rankAndCollapse } from '../../../src/core/digest.mjs';
import { CLASSES, detect } from '../../../src/games/microrts/events.mjs';
import { encode } from '../../../src/games/microrts/coder.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(HERE, 'fixtures');
export const fixtureFiles = () => (fs.existsSync(FIXTURES) ? fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json')).sort() : []);
export const loadFixture = f => JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8'));
export const snap = (fx, idx = 0) => ({ header: { lifecycle: 'active', phaseNative: 'running', clocks: { cycle: fx.state.cycle }, gameId: 'g1', seat: 0 }, native: fx.state, t: 0, idx });
export const triggersOf = (prev, fx) => rankAndCollapse((fx.events?.length ? fx.events : detect(prev?.state || null, fx.state)).map(ev => ({ ...ev, t: 0 })), { classes: CLASSES });
export const SAMPLE_LAST = [
  { cmd: { cmd: 'train', building: 20, type: 'Worker', count: 1 }, ok: true },
  { cmd: { cmd: 'harvest', units: [22], node: 16 }, ok: false, error: 'busy' },
  { cmd: { cmd: 'attack', units: [22], x: 13, y: 13 }, ok: false, error: 'dropped:stale' },
];
export function layersAt(i, files = fixtureFiles()) {
  const fx = loadFixture(files[i]), prev = i > 0 ? loadFixture(files[i - 1]) : null;
  return encode({ state: snap(fx, i + 1), prevDecisionState: prev && snap(prev, i), triggers: triggersOf(prev, fx), lastOrders: i > 0 ? SAMPLE_LAST : [] });
}

// A fake MicroRTS engine: dials the adapter's server and speaks the line protocol from a script.
export function fakeEngine(port) {
  const got = [];
  const sock = net.connect(port, '127.0.0.1');
  sock.unref();   // a test that throws before close() must not hold the runner open
  const ready = new Promise(r => sock.once('connect', r));
  readline.createInterface({ input: sock }).on('line', l => got.push(l));
  return {
    got, ready,
    send: (...lines) => { for (const l of lines) sock.write(l + '\n'); },
    async wait(n, ms = 3000) {
      const end = Date.now() + ms;
      while (got.length < n) { if (Date.now() > end) throw new Error(`only ${got.length} of ${n} lines: ${JSON.stringify(got)}`); await settle(); }
      return got[n - 1];
    },
    // next(): the next line the adapter writes after this call. Absolute indices drift as the handshake grows.
    async next(ms = 3000) { const n = got.length + 1; const end = Date.now() + ms; while (got.length < n) { if (Date.now() > end) throw new Error(`no line ${n}: ${JSON.stringify(got)}`); await settle(); } return got[n - 1]; },
    close: () => sock.destroy(),
  };
}
export const settle = (ms = 10) => new Promise(r => setTimeout(r, ms));

// A minimal 4x4 state for protocol and buffer tests: my base at 1,1, my worker at 0,1, a node at 0,0, an enemy at 3,3.
export const TT = {
  Resource: { cost: 1, hp: 1, pt: 10, mv: 10, rng: 1, dmg: 1, ht: 10, rt: 10, at: 10, res: true, pile: false, harv: false, move: false, atk: false, makes: [] },
  Base: { cost: 10, hp: 10, pt: 200, mv: 10, rng: 1, dmg: 1, ht: 10, rt: 10, at: 10, res: false, pile: true, harv: false, move: false, atk: false, makes: ['Worker'] },
  Worker: { cost: 1, hp: 1, pt: 50, mv: 10, rng: 1, dmg: 1, ht: 20, rt: 10, at: 5, res: false, pile: false, harv: true, move: true, atk: true, makes: ['Base', 'Barracks'] },
  Barracks: { cost: 5, hp: 4, pt: 100, mv: 10, rng: 1, dmg: 1, ht: 10, rt: 10, at: 10, res: false, pile: false, harv: false, move: false, atk: false, makes: ['Light', 'Heavy', 'Ranged'] },
  Light: { cost: 2, hp: 4, pt: 80, mv: 8, rng: 1, dmg: 2, ht: 10, rt: 10, at: 5, res: false, pile: false, harv: false, move: true, atk: true, makes: [] },
};
export const tiny = (over = {}) => ({
  cycle: 0, width: 4, height: 4, terrain: '0'.repeat(16), me: 0, res: [5, 5], tt: TT,
  units: [
    { id: 1, type: 'Resource', player: -1, x: 0, y: 0, hp: 1, carry: 25, busy: false, st: 'idle', eta: 0, idleFor: 0 },
    { id: 2, type: 'Base', player: 0, x: 1, y: 1, hp: 10, carry: 0, busy: false, st: 'idle', eta: 0, idleFor: 0 },
    { id: 3, type: 'Worker', player: 0, x: 0, y: 1, hp: 1, carry: 0, busy: false, st: 'idle', eta: 0, idleFor: 0 },
    { id: 4, type: 'Worker', player: 1, x: 3, y: 3, hp: 1, carry: 0, busy: false, st: 'idle', eta: 0, idleFor: 0 },
  ],
  ...over,
});
export const tinySnap = (over = {}) => ({ header: { lifecycle: 'active', phaseNative: 'running', clocks: { cycle: 0 }, gameId: 'g1', seat: 0 }, native: tiny(over), t: 0, idx: 1 });
// The raw engine-shaped state the protocol carries (pgs + actions), for proto/adapter tests.
export const rawState = (cycle = 0, units = null, actions = []) => ({
  time: cycle,
  pgs: {
    width: 4, height: 4, terrain: '0'.repeat(16),
    players: [{ ID: 0, resources: 5 }, { ID: 1, resources: 5 }],
    units: units || [
      { type: 'Resource', ID: 1, player: -1, x: 0, y: 0, resources: 25, hitpoints: 1 },
      { type: 'Base', ID: 2, player: 0, x: 1, y: 1, resources: 0, hitpoints: 10 },
      { type: 'Worker', ID: 3, player: 0, x: 0, y: 1, resources: 0, hitpoints: 1 },
      { type: 'Worker', ID: 4, player: 1, x: 3, y: 3, resources: 0, hitpoints: 1 },
    ],
  },
  actions,
});
export const RAW_UTT = { moveConflictResolutionStrategy: 1, unitTypes: Object.entries(TT).map(([name, t], i) => ({ ID: i, name, cost: t.cost, hp: t.hp, minDamage: 1, maxDamage: t.dmg, attackRange: t.rng, produceTime: t.pt, moveTime: t.mv, attackTime: t.at, harvestTime: t.ht, returnTime: t.rt, harvestAmount: 1, sightRadius: 3, isResource: t.res, isStockpile: t.pile, canHarvest: t.harv, canMove: t.move, canAttack: t.atk, produces: t.makes, producedBy: [] })) };

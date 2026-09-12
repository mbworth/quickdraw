import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from '../../../src/games/ashfall/coder.mjs';
import { toTrigger } from '../../../src/games/ashfall/events.mjs';
import { rankAndCollapse } from '../../../src/core/digest.mjs';
import { CLASSES } from '../../../src/games/ashfall/events.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(HERE, 'fixtures');
export const fixtureFiles = () => (fs.existsSync(FIXTURES) ? fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json')).sort() : []);
export const loadFixture = f => JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8'));
export const snap = (fx, idx = 0) => ({ header: { lifecycle: 'active', phaseNative: 'running', clocks: { game: fx.state.time }, gameId: '1', seat: 'team0' }, native: fx.state, t: 0, idx });
export const triggersOf = fx => rankAndCollapse(fx.events.map(ev => ({ ...toTrigger(ev, fx.state.team), t: 0 })), { classes: CLASSES });
export const SAMPLE_LAST = [{ cmd: { cmd: 'train', type: 'trooper', building: 13 }, ok: true }, { cmd: { cmd: 'build', type: 'depot', workers: [2], x: 70, z: -12 }, ok: false, error: 'Not enough ore (need 75, have 40)' }, { cmd: { cmd: 'move', units: ['army'], x: 0, z: 0, attackMove: true }, ok: false, error: 'dropped:stale' }];
export function layersAt(i, files = fixtureFiles(), opts = {}) {
  const fx = loadFixture(files[i]), prev = i > 0 ? loadFixture(files[i - 1]) : null;
  return encode({ state: snap(fx, i + 1), prevDecisionState: prev && snap(prev, i), triggers: triggersOf(fx), lastOrders: i > 0 ? SAMPLE_LAST : [] }, opts);
}

// The commander split (src/core/commander.mjs): rush.mjs plays every packet at 0 ms from a parameter set; this module
// is the commander's side of that contract — the schema it fills, and apply() turning its answer into the next params.
import { DEFAULTS } from './rush.mjs';

export const defaults = { ...DEFAULTS, target: null };

const CT = (lo, hi) => ({ type: 'integer', description: `${lo}-${hi}, clamped` });
export const tool = Object.freeze({
  type: 'object',
  properties: {
    harvesters: { ...CT(0, 6), description: 'workers kept mining at once (rule 1); default 2' },
    workers: { ...CT(1, 12), description: 'worker cap: the base stops producing more once this many are alive (rule 2); default 6' },
    barracksAt: { ...CT(1, 12), description: 'worker count that triggers the barracks build, bank permitting (rule 3); default 3' },
    defend: { ...CT(0, 16), description: 'distance to my base that pulls every free fighter onto an enemy (rule 5); default 6' },
    panic: { ...CT(0, 16), description: 'distance inside defend that also pulls the harvesters off their nodes to fight (rule 5); default 2, at most defend' },
    pushLight: { ...CT(1, 10), description: 'Light count that triggers the attack on their base (rule 6); default 3' },
    pushWorkers: { ...CT(1, 12), description: 'fighter count that triggers the attack when no barracks is coming (rule 6); default 6' },
    post: { ...CT(0, 6), description: 'steps from my base toward theirs where idle fighters hold ground (rule 7); default 1' },
    target: { type: ['string', 'null'], description: '"x,y" (0-15 each) to override the push/post destination in place of their base or the far node; null uses the computed one' },
    train: { type: 'string', description: 'unit types the barracks cycles through, comma-separated from li, hv, rg; default "li"' },
  },
  required: ['harvesters', 'workers', 'barracksAt', 'defend', 'panic', 'pushLight', 'pushWorkers', 'post', 'target', 'train'],
  additionalProperties: false,
});

export const toolDescription = 'Set the plan the reflex plays until your next call: the parameter set behind rules 1-7, plus an optional push/post target.';

const clamp = (v, lo, hi, fallback) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const parseTarget = (v, fallback) => {
  if (v === null) return null;
  const m = typeof v === 'string' && /^(\d+),(\d+)$/.exec(v);
  if (!m) return fallback;
  const x = Number(m[1]), y = Number(m[2]);
  return x >= 0 && x <= 15 && y >= 0 && y <= 15 ? { x, y } : fallback;
};
const TRAIN_TYPES = new Set(['li', 'hv', 'rg']);
const parseTrain = (v, fallback) => {
  if (typeof v !== 'string') return fallback;
  const types = v.split(',').map(s => s.trim()).filter(t => TRAIN_TYPES.has(t));
  return types.length ? types.join(',') : fallback;
};

// apply(input, prev) → params. Pure: any field out of range or the wrong shape falls back to prev's value.
export function apply(input, prev = defaults) {
  const i = input || {};
  const defend = clamp(i.defend, 0, 16, prev.defend);
  return {
    harvesters: clamp(i.harvesters, 0, 6, prev.harvesters),
    workers: clamp(i.workers, 1, 12, prev.workers),
    barracksAt: clamp(i.barracksAt, 1, 12, prev.barracksAt),
    defend,
    panic: clamp(i.panic, 0, defend, prev.panic),
    pushLight: clamp(i.pushLight, 1, 10, prev.pushLight),
    pushWorkers: clamp(i.pushWorkers, 1, 12, prev.pushWorkers),
    post: clamp(i.post, 0, 6, prev.post),
    target: parseTarget(i.target, prev.target),
    train: parseTrain(i.train, prev.train),
  };
}

// The commander split (src/core/commander.mjs): rush.mjs plays every packet at 0 ms from a parameter set; this module
// is the commander's side of that contract — the schema it fills, and apply() turning its answer into the next params.
import { DEFAULTS } from './rush.mjs';
import { read } from '../read.mjs';
export { createObserver, CLASSIFIERS } from './observe.mjs';

export const defaults = { ...DEFAULTS, target: null };

const MOBILE = ['wk', 'li', 'hv', 'rg'];
export const METRICS = [...MOBILE, 'army', ...MOBILE.map(t => `foe_${t}`), 'bank', 'base_hp', 'br', 'foe_br'];

// measure(packet) → {cycle, <metric>: number} for every METRICS entry: what the commander's `expect` is graded on, read off the
// packet the same way rush.mjs reads it (A my clusters, X theirs, B my buildings, H the header).
export function measure(packet) {
  const k = typeof packet === 'string' ? read(packet) : packet;
  const n = (cs, t) => cs.filter(c => c.type === t).reduce((a, c) => a + c.n, 0);
  const m = { cycle: k.h?.t ?? 0, bank: k.h?.r ?? 0, base_hp: k.b.find(c => c.type === 'ba')?.hp ?? 0, br: k.b.some(c => c.type === 'br') ? 1 : 0, foe_br: k.x.some(c => c.type === 'br') ? 1 : 0 };
  for (const t of MOBILE) { m[t] = n(k.a, t); m[`foe_${t}`] = n(k.x, t); }
  m.army = m.li + m.hv + m.rg;
  return m;
}

// describe(packet, params) → F's "at target" clause: what stands at the commander's own target, or null if it set none.
export function describe(packet, params) {
  if (params?.target == null) return null;
  const T = params.target;
  const k = typeof packet === 'string' ? read(packet) : packet;
  const cheb = c => Math.max(Math.abs(c.x - T.x), Math.abs(c.y - T.y));
  const at = k.x.filter(c => cheb(c) <= 2);
  if (at.length) return `at target ${T.x},${T.y}: ${at.map(c => `${c.type} x${c.n}`).join(' ')}`;
  if (!k.x.length) return `at target ${T.x},${T.y}: nothing within 2, no foe seen`;
  const near = k.x.reduce((a, c) => (cheb(c) < cheb(a) ? c : a));
  const d = cheb(near), id = near.ids[0] != null ? `#${near.ids[0]}` : '';
  return `at target ${T.x},${T.y}: nothing within 2, nearest foe ${near.type}${id} d${d} at ${near.x},${near.y}`;
}

const CT = (lo, hi) => ({ type: 'integer', description: `${lo}-${hi}, clamped` });
export const tool = Object.freeze({
  type: 'object',
  properties: {
    harvesters: { ...CT(0, 6), description: 'workers kept mining at once (rule 1); default 2' },
    workers: { ...CT(1, 12), description: 'worker cap: the base stops producing more once this many are alive (rule 2); default 6' },
    barracksAt: { ...CT(1, 12), description: 'worker count that triggers the barracks build, bank permitting (rule 3); default 3' },
    barracks: { ...CT(1, 3), description: 'barracks the reflex builds up to, bank permitting; default 1' },
    defend: { ...CT(0, 16), description: 'distance to your base that pulls every free fighter onto an enemy (rule 5); default 6' },
    panic: { ...CT(0, 16), description: 'distance inside defend that also pulls the harvesters off their nodes to fight (rule 5); default 2, at most defend' },
    pushLight: { ...CT(1, 10), description: 'combat unit count, any type, that triggers the attack on their base (rule 6); default 3' },
    pushWorkers: { ...CT(1, 12), description: 'fighter count that triggers the attack when no barracks is coming (rule 6); default 6' },
    post: { ...CT(0, 6), description: 'steps from your base toward theirs where idle fighters hold ground (rule 7); default 1' },
    target: { type: ['string', 'null'], description: '"x,y" (0-15 each) to override the push/post destination in place of their base or the far node; null uses the computed one' },
    train: { type: 'string', description: 'unit types the barracks cycles through, comma-separated from li, hv, rg; default "li"' },
    group: { ...CT(1, 16), description: 'army units within this many steps of each other push as one cluster, the rest walk to join it; default 2' },
    engage: { ...CT(0, 12), description: 'fewer free army units than this hold the post against an enemy inside defend but outside panic; default 2' },
    guard: { ...CT(0, 6), description: 'army units held at the post while the rest push; default 0' },
    plan: { type: 'string', description: 'your plan in one line, your own words, at most 120 characters' },
    expect: {
      type: ['object', 'null'],
      description: 'the checkable claim your plan makes, graded on every packet and reported back on F; null claims nothing',
      properties: {
        metric: { type: 'string', enum: METRICS, description: 'your unit counts wk/li/hv/rg, army = li+hv+rg, their seen counts foe_*, bank, base_hp (yours), br and foe_br (barracks alive 0/1)' },
        op: { type: 'string', enum: ['>=', '<=', '=='] },
        value: { type: 'number' },
        by: { type: 'integer', description: 'the cycle it must hold by' },
      },
      required: ['metric', 'op', 'value', 'by'],
      additionalProperties: false,
    },
  },
  required: ['harvesters', 'workers', 'barracksAt', 'barracks', 'defend', 'panic', 'pushLight', 'pushWorkers', 'post', 'target', 'train', 'group', 'engage', 'guard', 'plan', 'expect'],
  additionalProperties: false,
});

export const toolDescription = 'Set the plan the reflex plays until your next call: the parameter set behind rules 1-7, plus an optional push/post target, your plan in one line and the expect it is graded on.';

// --commander-steps: `plan`/`expect` give way to `steps` (a multi-step plan, graded step by step) and `why`.
const { plan: _plan, expect: _expect, ...levers } = tool.properties;
export const toolSteps = Object.freeze({
  ...tool,
  properties: {
    ...levers,
    steps: {
      type: ['array', 'null'],
      description: 'null keeps the plan in force; 1-4 steps replace it, step 1 begins when your answer lands',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          do: { type: 'string', description: 'the step in your own words, at most 80 characters' },
          until: { ...tool.properties.expect, type: 'object', description: 'the checkable condition that ends the step' },
        },
        required: ['do', 'until'],
        additionalProperties: false,
      },
    },
    why: { type: ['string', 'null'], description: 'with steps, the reason for the new plan, at most 80 characters; null with steps null' },
  },
  required: [...tool.required.filter(k => k !== 'plan' && k !== 'expect'), 'steps', 'why'],
});

export const toolStepsDescription = 'Set the plan the reflex plays until your next call: the parameter set behind rules 1-7, plus an optional push/post target, and your steps, kept or replaced.';

// --strategist-model: the plan alone, no levers.
export const toolStrategist = Object.freeze({
  type: 'object',
  properties: { steps: toolSteps.properties.steps, why: toolSteps.properties.why },
  required: ['steps', 'why'],
  additionalProperties: false,
});

export const toolStrategistDescription = 'Keep or replace the plan the operator reads in S.';

// --strategist-lock: the operator sets levers only.
export const toolLevers = Object.freeze({ ...tool, properties: levers, required: tool.required.filter(k => k !== 'plan' && k !== 'expect') });

export const toolLeversDescription = 'Set the parameter set behind rules 1-7 the reflex plays until your next call, plus an optional push/post target.';

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

// apply(input, prev) → params. Pure: any field out of range or the wrong shape falls back to prev's value. `plan`, `expect`, `steps`
// and `why` are not reflex params: core reads them off the tool input and grades them (src/core/commander.mjs).
export function apply(input, prev = defaults) {
  const i = input || {};
  const defend = clamp(i.defend, 0, 16, prev.defend);
  return {
    harvesters: clamp(i.harvesters, 0, 6, prev.harvesters),
    workers: clamp(i.workers, 1, 12, prev.workers),
    barracksAt: clamp(i.barracksAt, 1, 12, prev.barracksAt),
    barracks: clamp(i.barracks, 1, 3, prev.barracks),
    defend,
    panic: clamp(i.panic, 0, defend, prev.panic),
    pushLight: clamp(i.pushLight, 1, 10, prev.pushLight),
    pushWorkers: clamp(i.pushWorkers, 1, 12, prev.pushWorkers),
    post: clamp(i.post, 0, 6, prev.post),
    target: parseTarget(i.target, prev.target),
    train: parseTrain(i.train, prev.train),
    group: clamp(i.group, 1, 16, prev.group),
    engage: clamp(i.engage, 0, 12, prev.engage),
    guard: clamp(i.guard, 0, 6, prev.guard),
  };
}

// Native state → the same facts read.mjs returns, with no text round trip: the state side of the fidelity oracle
// (bin/oracle.mjs). Same shape as read()'s, the same gameOpts as encode(), and the same derived quantities as coder.mjs —
// every structured layer comes from coder's *Facts function, the one its renderer prints, so the two sides cannot drift.
// Oracle v2: this is the FULL state view, not the encoder's shaping. Every mobile unit is its own A entry (r: -1 never
// merges, so n=1 with its own state and position); B already carries every building with its position. What the packet's
// shaping folds away (a cluster of one harvester and one walker reading as two harvesters) is compression loss, and what
// the budget or the cadence drops is budget loss: the oracle measures both against this.
// Oracle v3: X unfolds the same way — one line per enemy, its own cell, its own id and its own dB/dA, never merged.
// D, T and L are classifications of their own rendered text, so they go through coder's renderer and read's classifier —
// one source each, and still no encode/assemble round trip.
import { TAG } from './abbr.mjs';
import { headerFacts, productionFacts, economyFacts, armyClusters, buildingFacts, enemyFacts, FULL_R,
  delta as renderDelta, renderTrigger, lastOrders as renderLast } from './coder.mjs';
import { delta as readDelta, triggers as readTriggers, last as readLast } from './read.mjs';

const ALL = Object.values(TAG);

// factsOf(encode's inputs, encode's gameOpts) → read()'s shape, unbudgeted and unshaped: layers is all nine tags.
export function factsOf({ state, prevDecisionState = null, triggers = [], lastOrders: lo = [], pending = [] }, opts = {}) {
  const n = state.native, prev = prevDecisionState?.native || null;
  const tText = triggers.slice(0, 6).map(renderTrigger).join('; ') || 'none';
  const lText = renderLast(lo) + (pending.length ? `; ${pending.map(set => set.slice(0, 4).map(renderTrigger).join(', ')).join(' | ')}` : '');
  return {
    h: headerFacts(n), d: readDelta(renderDelta(prev, n)), t: readTriggers(tText),
    p: productionFacts(n), e: economyFacts(n), a: armyClusters(n, { ...opts, r: FULL_R }), b: buildingFacts(n), x: enemyFacts(n, { r: FULL_R }),
    l: readLast(lText), layers: new Set(ALL),
  };
}

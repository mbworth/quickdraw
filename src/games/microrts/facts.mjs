// Native state → the same facts read.mjs returns, with no text round trip: the state side of the fidelity oracle
// (bin/oracle.mjs). Same shape as read()'s, the same gameOpts as encode(), and the same derived quantities as coder.mjs —
// every structured layer comes from coder's *Facts function, the one its renderer prints, so the two sides cannot drift.
// The one difference is the budget: every layer is here with every line, so what the packet dropped is the gap the
// oracle measures. D, T and L are classifications of their own rendered text, so they go through coder's renderer and
// read's classifier — one source each, and still no encode/assemble round trip.
import { TAG } from './abbr.mjs';
import { headerFacts, productionFacts, economyFacts, armyClusters, buildingFacts, enemyFacts,
  delta as renderDelta, renderTrigger, lastOrders as renderLast } from './coder.mjs';
import { delta as readDelta, triggers as readTriggers, last as readLast } from './read.mjs';

const ALL = Object.values(TAG);

// factsOf(encode's inputs, encode's gameOpts) → read()'s shape, unbudgeted: layers is all nine tags.
export function factsOf({ state, prevDecisionState = null, triggers = [], lastOrders: lo = [], pending = [] }) {
  const n = state.native, prev = prevDecisionState?.native || null;
  const tText = triggers.slice(0, 6).map(renderTrigger).join('; ') || 'none';
  const lText = renderLast(lo) + (pending.length ? `; ${pending.map(set => set.slice(0, 4).map(renderTrigger).join(', ')).join(' | ')}` : '');
  return {
    h: headerFacts(n), d: readDelta(renderDelta(prev, n)), t: readTriggers(tText),
    p: productionFacts(n), e: economyFacts(n), a: armyClusters(n), b: buildingFacts(n), x: enemyFacts(n),
    l: readLast(lText), layers: new Set(ALL),
  };
}

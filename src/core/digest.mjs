// Generic delta and ranking helpers. Adapters render; this diffs and ranks.

const get = (obj, path) => typeof path === 'function' ? path(obj) : path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

// diffById(prev, next, {lists:[{name, path, fields?}]}) → {[name]: {added, removed, changed}}, entities keyed by id
// changed = [{prev, next, fields}] where fields are the compared field names that differ.
export function diffById(prev, next, { lists }) {
  const out = {};
  for (const { name, path, fields } of lists) {
    const a = get(prev, path) || [], b = get(next, path) || [];
    const byA = new Map(a.map(x => [x.id, x])), byB = new Map(b.map(x => [x.id, x]));
    const added = [], removed = [], changed = [];
    for (const x of b) if (!byA.has(x.id)) added.push(x);
    for (const x of a) if (!byB.has(x.id)) removed.push(x);
    for (const x of b) {
      const p = byA.get(x.id); if (!p) continue;
      const keys = fields || [...new Set([...Object.keys(p), ...Object.keys(x)])];
      const diff = keys.filter(f => JSON.stringify(p[f]) !== JSON.stringify(x[f]));
      if (diff.length) changed.push({ prev: p, next: x, fields: diff });
    }
    out[name] = { added, removed, changed };
  }
  return out;
}

export const rankOf = (tr, classes) => tr.urgency ?? (classes.indexOf(tr.cls) >= 0 ? classes.indexOf(tr.cls) : classes.length);

// rankAndCollapse(triggers, {classes}) → sorted by rank then arrival, repeats by (cls,key) collapsed with count.
export function rankAndCollapse(triggers, { classes }) {
  const seen = new Map();
  for (const tr of triggers) {
    const k = tr.cls + '\0' + tr.key;
    const cur = seen.get(k);
    if (!cur) seen.set(k, { ...tr, count: tr.count ?? 1 });
    else { cur.count += tr.count ?? 1; if (tr.t < cur.t) cur.t = tr.t; if ((tr.urgency ?? Infinity) < (cur.urgency ?? Infinity)) cur.urgency = tr.urgency; cur.native = tr.native ?? cur.native; }
  }
  return [...seen.values()].sort((x, y) => rankOf(x, classes) - rankOf(y, classes) || x.t - y.t);
}

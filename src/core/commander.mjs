// The commander split: a scripted reflex answers every packet at 0 ms from a parameter set, while an API model (the commander) runs
// in the background on its own clock, reads the latest packet, and returns the next parameter set (+ a note). Knows no game: the
// reflex, the order-language decode, the params, their schema and apply() all come from the game's policy/.
import { answered } from './model.mjs';

const zero = () => ({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 });
const add = (a, b) => { for (const k of Object.keys(a)) a[k] += b?.[k] || 0; return a; };
const toolInput = res => (res.raw?.content || []).find(b => b.type === 'tool_use')?.input ?? null;
const fmt = v => (v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// expect: the commander's own checkable claim, `{metric, op, value, by}` in the tool answer, graded by the game's measure(packet).
const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '==': (a, b) => a === b };
const EXT = { '>=': 'max', '<=': 'min', '==': 'last' };
const okExpect = e => (e && typeof e === 'object' && OPS[e.op] && typeof e.metric === 'string' && Number.isFinite(e.value) && Number.isFinite(e.by)
  ? { metric: e.metric, op: e.op, value: e.value, by: e.by } : null);
const gradeText = g => {
  if (g === 'none') return 'expect: none';
  const head = `expect ${g.metric}${g.op}${g.value} by t${g.by}`;
  const moved = g.moved || 0, values = g.values || [];
  const hist = moved > 0 || values.length > 1;
  const label = hist ? `${EXT[g.op]} since t${g.since}` : EXT[g.op];
  const tail = hist ? `; ${[`claim since t${g.since}`, moved > 0 ? `by moved ${moved}x` : null, values.length > 1 ? `value ${values.join('>')}` : null].filter(Boolean).join(', ')}` : '';
  if (g.verdict === 'met') return `${head}: MET t${g.met}${tail}`;
  const seen = g.best === null ? '' : ` (${label} ${g.best}${g.verdict === 'pending' ? `, t${g.bestT}` : ''})`;
  return `${head}: ${g.verdict === 'missed' ? 'MISSED' : 'pending'}${seen}${tail}`;
};
const expectText = ({ plan = null, grade = 'none' }) => `${plan ? `plan: ${plan} | ` : ''}${gradeText(grade)}`;

// expectTracker(measure): set() on each landed answer, see() on every reflex packet, read() → the commander's own plan line and the
// grade of its expect. MET at the first packet the condition holds, MISSED once the packet cycle passes `by`, else pending; the
// verdict stands until the next answer replaces it. A new expect with the same metric/op as the one in force is the same claim:
// `since`, `best`/`bestT` carry over; `moved` counts `by` changes, `values` the distinct consecutive `value`s claimed.
export function expectTracker(measure) {
  let exp = null, plan = null, met = null, best = null, bestT = null, at = null;
  let since = 0, moved = 0, values = [];
  return {
    set(e, p = null) {
      const ne = okExpect(e);
      plan = typeof p === 'string' && p.trim() ? p.trim() : null;
      const same = exp && ne && ne.metric === exp.metric && ne.op === exp.op;
      if (same) {
        if (ne.by !== exp.by) moved++;
        if (ne.value !== values[values.length - 1]) values.push(ne.value);
      } else {
        best = null; bestT = null; since = at ?? 0; moved = 0; values = ne ? [ne.value] : [];
      }
      met = null;
      exp = ne;
    },
    see(packet) {
      if (!exp) return;
      let m; try { m = measure(packet); } catch { return; }
      const v = m?.[exp.metric];
      if (typeof v !== 'number') { exp = null; return; }   // a metric this game does not measure
      at = m.cycle;
      if (best === null || exp.op === '==' || (exp.op === '<=' ? v < best : v > best)) { best = v; bestT = m.cycle; }
      if (met === null && OPS[exp.op](v, exp.value)) met = m.cycle;
    },
    read: () => ({ plan, grade: !exp ? 'none' : { ...exp, met, best, bestT, since, moved, values: [...values], verdict: met !== null ? 'met' : at !== null && at > exp.by ? 'missed' : 'pending' } }),
  };
}

// F: what the commander's own last parameter set did — the diff it made, how long it has been in force, how many reflex orders it
// actually changed (the reflex is re-run on the old set to compare), and how its `expect` graded. Params and metrics are opaque
// here: no game knowledge. `expect` ({plan, grade}) null drops the clause entirely (no measure on this game).
export function feedbackLayer({ setSeq = null, sinceN = 0, prev = null, cur = null, differed = 0, last = null, expect = null } = {}) {
  if (setSeq === null) return 'F none';
  const keys = [...new Set([...Object.keys(cur || {}), ...Object.keys(prev || {})])];
  const diff = keys.filter(k => JSON.stringify(prev?.[k]) !== JSON.stringify(cur?.[k])).map(k => `${k} ${fmt(prev?.[k])}>${fmt(cur?.[k])}`);
  let s = `F set ${setSeq} in force ${sinceN} decisions: ${diff.length ? diff.join(' ') : 'unchanged'} | orders differed ${differed}/${sinceN}`;
  if (expect) s += ` | ${expectText(expect)}`;
  if (last) s += ` | ${`last: ${last.o} / was ${last.was}`.slice(0, 200)}`;
  return s;
}

// commanderModel({reflex, decode, commander, params, apply, everyMs, clock, log}) → callModel({packet, signal, onOrders})
// The cadence is checked on each reflex call (no timers of its own): a new commander call starts when none is in flight and either
// this is the first call or everyMs has passed since the last one started. Its note, usage/cost and a small summary ride out on the
// first reflex result after it lands.
export function commanderModel({ reflex, decode, commander, params, apply, measure = null, everyMs = 5000, clock = { now: () => Date.now() }, log = () => {} }) {
  let cur = params, inFlight = null, ac = null, seq = 0, reflexN = 0, lastStartT = null;
  let note = null, usage = zero(), spend = 0, summary = null;
  let prev = null, setSeq = null, sinceN = 0, differed = 0, last = null;   // the F layer's state
  const track = measure ? expectTracker(measure) : null;
  const feedback = () => feedbackLayer({ setSeq, sinceN, prev, cur, differed, last, expect: track?.read() ?? null });

  function launch(packet, atN) {
    const my = new AbortController(), n = ++seq, F = feedback();
    ac = my; lastStartT = clock.now();
    const p = (async () => {
      let res;
      try { res = await commander({ packet: `${packet}\n${F}`, signal: my.signal }); }
      catch (err) { summary = { seq: n, input: null, stop: 'error:unknown', error: String(err?.message || err), latencyMs: 0, apiPacketN: atN, feedback: F }; log('commander failed', err); return; }
      add(usage, res.usage); spend += res.cost || 0;
      const input = answered(res.stop) ? toolInput(res) : null;
      if (!input || typeof input !== 'object') {
        summary = { seq: n, input: null, stop: res.stop, error: res.error || (answered(res.stop) ? 'no tool_use' : undefined), latencyMs: res.latencyMs, apiPacketN: atN, feedback: F };
        return;
      }
      const was = cur;
      try { cur = apply(input, cur); } catch (err) { summary = { seq: n, input, stop: res.stop, error: `apply: ${err?.message || err}`, latencyMs: res.latencyMs, apiPacketN: atN, feedback: F }; return; }
      prev = was; setSeq = n; sinceN = 0; differed = 0; last = null;
      track?.set(input.expect, input.plan);
      if (typeof input.n === 'string') note = input.n;
      summary = { seq: n, input, stop: res.stop, latencyMs: res.latencyMs, apiPacketN: atN, feedback: F };
    })().finally(() => { if (ac === my) { ac = null; inFlight = null; } });
    inFlight = p;
  }

  async function callModel({ packet, signal, onOrders = null } = {}) {
    const t0 = clock.now(), n = ++reflexN;
    track?.see(packet);
    if (signal) signal.addEventListener('abort', () => ac?.abort(), { once: true });
    if (!inFlight && (lastStartT === null || clock.now() - lastStartT >= everyMs)) launch(packet, n);
    try {
      const { o, why } = reflex(packet, cur);   // the reflex never sees the F line: it reads the packet the game sent
      if (setSeq !== null) {
        sinceN++;
        if (prev && cur !== prev) {
          let was = null;
          try { was = reflex(packet, prev).o; } catch { was = null; }
          if (was !== null && was !== o) { differed++; last = { o, was }; }
        }
      }
      const d = decode({ o });
      if (d.orders.length && onOrders) onOrders(d.orders);
      const out = {
        act: d.act, orders: d.orders, note, usage, stop: 'tool_use', latencyMs: clock.now() - t0, cost: spend,
        raw: { o, why, params: cur, ...(summary ? { commander: summary } : {}) }, streamed: onOrders ? d.orders.length : 0,
      };
      note = null; usage = zero(); spend = 0; summary = null;   // each rides out exactly once
      return out;
    } catch (err) {
      return { act: false, orders: [], note: null, usage: zero(), stop: 'error:read', error: String(err?.message || err), latencyMs: clock.now() - t0, cost: 0 };
    }
  }
  callModel.params = () => cur;
  callModel.feedback = feedback;
  callModel.close = () => { ac?.abort(); return inFlight || Promise.resolve(); };
  return callModel;
}

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
      met = same && best !== null && OPS[ne.op](best, ne.value) ? bestT : null;   // a restated claim that already held stays MET
      exp = ne;
    },
    see(packet) {
      let m; try { m = measure(packet); } catch { return; }
      if (Number.isFinite(m?.cycle)) at = m.cycle;   // so a first claim's `since` is the cycle it was made at
      if (!exp) return;
      const v = m?.[exp.metric];
      if (typeof v !== 'number') { exp = null; return; }   // a metric this game does not measure
      if (best === null || exp.op === '==' || (exp.op === '<=' ? v < best : v > best)) { best = v; bestT = m.cycle; }
      if (met === null && OPS[exp.op](v, exp.value)) met = m.cycle;
    },
    current: () => (exp ? { ...exp, since } : null),
    read: () => ({ plan, grade: !exp ? 'none' : { ...exp, met, best, bestT, since, moved, values: [...values], verdict: met !== null ? 'met' : at !== null && at > exp.by ? 'missed' : 'pending' } }),
  };
}

// planTracker(measure): the steps-mode plan. set(steps, why) on each landed answer (null or invalid keeps the plan), see() on every
// packet grades only the `now` step: when its `until` holds it is done and the next step is graded from the same packet; past `by`
// it reads MISSED and stays `now`. A new plan whose step 1 has the metric/op of the replaced `now` step carries its claim history.
const okSteps = s => {
  if (!Array.isArray(s) || s.length < 1 || s.length > 4) return null;
  const out = s.map(x => (x && typeof x.do === 'string' && okExpect(x.until) ? { do: x.do.trim().slice(0, 80), until: okExpect(x.until) } : null));
  return out.every(Boolean) ? out : null;
};
const OPS_NAME = { met: 'MET', missed: 'MISSED' };
export function planTracker(measure) {
  let plan = null, planN = 0, kept = 0, at = null;
  const holds = s => s.best !== null && OPS[s.until.op](s.best, s.until.value);
  const nowOf = () => plan?.steps.find(s => s.state === 'now') ?? null;
  const begin = (i, t) => { const s = plan.steps[i]; if (s) { s.state = 'now'; s.began = t; s.since ??= t; } };
  const grade = (s, m) => {
    const v = m?.[s.until.metric];
    if (typeof v !== 'number') return false;
    if (s.best === null || s.until.op === '==' || (s.until.op === '<=' ? v < s.best : v > s.best)) { s.best = v; s.bestT = m.cycle; }
    if (!OPS[s.until.op](v, s.until.value)) return false;
    s.state = 'done'; s.doneT = m.cycle;
    return true;
  };
  const condText = u => `${u.metric}${u.op}${u.value} by t${u.by}`;
  const gradeOf = s => {
    const hist = s.moved > 0 || s.values.length > 1;
    const tail = hist ? `; ${['same claim since t' + s.since, s.moved > 0 ? `by moved ${s.moved}x` : null, s.values.length > 1 ? `value ${s.values.join('>')}` : null].filter(Boolean).join(', ')}` : '';
    if (s.state === 'done') return `MET t${s.doneT}${tail}`;
    const missed = at !== null && at > s.until.by;
    const seen = s.best === null ? '' : ` (${EXT[s.until.op]} ${s.best}${missed ? '' : `, t${s.bestT}`})`;
    return `${missed ? 'MISSED' : 'pending'}${seen}${tail}`;
  };
  return {
    set(steps, why = null) {
      const ns = okSteps(steps);
      if (!ns) { if (plan) kept++; return; }
      const old = nowOf(), setT = at ?? 0;
      plan = { steps: ns.map(x => ({ ...x, state: 'next', began: null, since: null, doneT: null, best: null, bestT: null, moved: 0, values: [x.until.value] })), setT, why: typeof why === 'string' && why.trim() ? why.trim().slice(0, 80) : null };
      planN++; kept = 0;
      const s1 = plan.steps[0];
      if (old && old.until.metric === s1.until.metric && old.until.op === s1.until.op) {
        Object.assign(s1, { since: old.since, best: old.best, bestT: old.bestT, moved: old.moved + (old.until.by !== s1.until.by ? 1 : 0), values: old.values.at(-1) === s1.until.value ? [...old.values] : [...old.values, s1.until.value] });
      }
      begin(0, setT);
      if (holds(s1)) { s1.state = 'done'; s1.doneT = s1.bestT; begin(1, setT); }   // a restated claim that already held is done
    },
    see(packet) {
      let m; try { m = measure(packet); } catch { return; }
      if (Number.isFinite(m?.cycle)) at = m.cycle;
      for (let s = nowOf(); s && grade(s, m); s = nowOf()) begin(plan.steps.indexOf(s) + 1, m.cycle);
    },
    current: () => { const s = nowOf(); return s ? { ...s.until, since: s.since } : null; },
    verdict() {
      if (!plan) return null;
      const s = nowOf();
      if (!s) return { plan: planN, step: plan.steps.length, verdict: 'done' };
      const i = plan.steps.indexOf(s);
      if (at !== null && at > s.until.by) return { plan: planN, step: i + 1, verdict: 'missed' };
      return i > 0 ? { plan: planN, step: i, verdict: 'met' } : { plan: planN, step: 1, verdict: 'pending' };
    },
    read() {
      if (!plan) return 'S none';
      const r = planN - 1, last = plan.steps.at(-1);
      const head = `S plan ${planN} set t${plan.setT}; kept ${kept} calls${r > 0 ? `; replaced ${r}x${plan.why ? `, last why: ${plan.why}` : ''}` : plan.why ? `; why: ${plan.why}` : ''}${last.state === 'done' ? `; all steps done t${last.doneT}` : ''}`;
      return [head, ...plan.steps.map((s, i) => s.state === 'next' ? `S${i + 1} next: ${s.do} | ${condText(s.until)}`
        : `S${i + 1} ${s.state === 'done' ? `done t${s.doneT}` : `now since t${s.began}`}: ${s.do} | ${condText(s.until)}: ${gradeOf(s)}`)].join('\n');
    },
  };
}
// stepReason(prev, v) → the events-gate reason when planTracker.verdict() changed to a step MET/MISSED or the plan done, else null.
export const stepReason = (p, v) => (!v || (p && p.plan === v.plan && p.step === v.step && p.verdict === v.verdict) ? null
  : v.verdict === 'done' ? 'plan done' : OPS_NAME[v.verdict] ? `step ${v.step} ${OPS_NAME[v.verdict]}` : null);

// F: what the commander's own last parameter set did — the diff it made, how long it has been in force, how many reflex orders it
// actually changed (the reflex is re-run on the old set to compare), and how its `expect` graded. Params and metrics are opaque
// here: no game knowledge. `expect` ({plan, grade}) null drops the clause entirely (no measure on this game).
export function feedbackLayer({ setSeq = null, sinceN = 0, prev = null, cur = null, differed = 0, last = null, expect = null, landed = null, at = null, lag = null } = {}) {
  if (setSeq === null) return 'F none';
  const diffOf = (a, b) => [...new Set([...Object.keys(b || {}), ...Object.keys(a || {})])].filter(k => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).map(k => `${k} ${fmt(a?.[k])}>${fmt(b?.[k])}`);
  const diff = diffOf(prev, cur);
  let s = `F set ${setSeq} in force ${sinceN} decisions: ${diff.length ? diff.join(' ') : 'unchanged'} | orders differed ${differed}/${sinceN}`;
  if (lag) s += ` | answer read t${lag.read}, landed t${lag.landed}`;
  if (expect) s += ` | ${expectText(expect)}`;
  if (at) s += ` | ${at}`;
  if (last) s += ` | ${`last: ${last.o} / was ${last.was}`.slice(0, 200)}`;
  if (landed) { const d = diffOf(landed.prev, landed.cur); s += ` | set ${landed.setSeq} landed: ${d.length ? d.join(' ') : 'unchanged'}`; }
  return s;
}

// commanderModel({reflex, decode, commander, params, apply, measure, describe, observe, everyMs, gate, maxEveryMs, clock, log}); observe.read() lines ride after F (S first when steps). → callModel({packet, signal, onOrders})
// The cadence is checked on each reflex call (no timers of its own): a new commander call starts when none is in flight and either
// this is the first call or everyMs has passed since the last one started. gate 'events' also needs a reason: the first call, an
// observe.events() entry, the expect turning MET/MISSED, or maxEveryMs since the last start; the reasons ride as an `E` line and
// summary.why. Its note, usage/cost and a small summary ride out on the first reflex result after it lands. steps: planTracker in place
// of expectTracker; its S block rides between F and O.
export function commanderModel({ reflex, decode, commander, params, apply, measure = null, describe = null, observe = null, everyMs = 5000, gate = 'timer', maxEveryMs = 0, steps = false, clock = { now: () => Date.now() }, log = () => {} }) {
  if (gate !== 'timer' && gate !== 'events') throw new Error(`gate: timer or events, not "${gate}"`);
  let cur = params, inFlight = null, ac = null, seq = 0, reflexN = 0, lastStartT = null, lastPacket = null;
  let note = null, usage = zero(), spend = 0, summary = null;
  let prev = null, setSeq = null, sinceN = 0, differed = 0, last = null, closed = null;   // the F layer's state; closed = the last window that saw decisions
  let pend = [], verdict = null;   // events gate: reasons since the last launch, the last verdict seen
  let lag = null;   // steps mode only: {read, landed} cycles of the newest landed answer
  const track = steps ? planTracker(measure) : measure ? expectTracker(measure) : null;
  const safe = fn => { try { return fn(); } catch { return null; } };
  // A set that has seen no decisions yet (the serial loop relaunches on the packet it landed on) says nothing: report the last window that did.
  const feedback = () => feedbackLayer({ ...(sinceN === 0 && closed ? { ...closed, landed: { setSeq, prev, cur } } : { setSeq, sinceN, prev, cur, differed, last }), expect: steps ? null : track?.read() ?? null, lag, at: describe ? safe(() => describe(lastPacket, cur)) : null });

  function launch(packet, atN, why = null) {
    const my = new AbortController(), n = ++seq, F = feedback(), O = observe ? safe(() => observe.read(cur, { expect: track?.current() ?? null })) : null;
    const E = why ? `E ${why.join('; ')}` : null, S = steps ? track.read() : null;
    const readT = steps ? safe(() => measure(packet).cycle) : null;
    const meta = { apiPacketN: atN, feedback: F, ...(S ? { plan: S } : {}), ...(O ? { observe: O } : {}), ...(why ? { why } : {}) };
    ac = my; lastStartT = clock.now();
    const p = (async () => {
      let res;
      try { res = await commander({ packet: [packet, F, S, O, E].filter(Boolean).join('\n'), signal: my.signal }); }
      catch (err) { summary = { seq: n, input: null, stop: 'error:unknown', error: String(err?.message || err), latencyMs: 0, ...meta }; log('commander failed', err); return; }
      add(usage, res.usage); spend += res.cost || 0;
      const input = answered(res.stop) ? toolInput(res) : null;
      if (!input || typeof input !== 'object') {
        summary = { seq: n, input: null, stop: res.stop, error: res.error || (answered(res.stop) ? 'no tool_use' : undefined), latencyMs: res.latencyMs, ...meta };
        return;
      }
      const was = cur;
      try { cur = apply(input, cur); } catch (err) { summary = { seq: n, input, stop: res.stop, error: `apply: ${err?.message || err}`, latencyMs: res.latencyMs, ...meta }; return; }
      if (setSeq !== null && sinceN > 0) closed = { setSeq, sinceN, prev, cur: was, differed, last };
      prev = was; setSeq = n; sinceN = 0; differed = 0; last = null;
      if (steps) {
        track.set(input.steps, input.why);
        const landedT = safe(() => measure(lastPacket).cycle);
        if (Number.isFinite(readT) && Number.isFinite(landedT)) lag = { read: readT, landed: landedT };
      } else track?.set(input.expect, input.plan);
      if (typeof input.n === 'string') note = input.n;
      summary = { seq: n, input, stop: res.stop, latencyMs: res.latencyMs, ...meta };
    })().finally(() => { if (ac === my) { ac = null; inFlight = null; } });
    inFlight = p;
  }

  async function callModel({ packet, signal, onOrders = null } = {}) {
    const t0 = clock.now(), n = ++reflexN;
    track?.see(packet);
    observe?.see(packet, cur);
    lastPacket = packet;
    if (signal) signal.addEventListener('abort', () => ac?.abort(), { once: true });
    const due = !inFlight && (lastStartT === null || clock.now() - lastStartT >= everyMs);
    if (gate === 'timer') { if (due) launch(packet, n); }
    else {
      pend.push(...(safe(() => observe?.events?.()) ?? []));
      if (steps) { const v = track.verdict(), r = stepReason(verdict, v); if (r) pend.push(r); verdict = v; }
      else {
        const v = track?.read().grade.verdict ?? null;
        if (v !== verdict && (v === 'met' || v === 'missed')) pend.push(`expect ${v.toUpperCase()}`);
        verdict = v;
      }
      if (due) {
        const why = [lastStartT === null ? 'first call' : null, ...pend, lastStartT !== null && maxEveryMs > 0 && clock.now() - lastStartT >= maxEveryMs ? `heartbeat ${Math.round(maxEveryMs / 1000)} s` : null].filter(Boolean);
        if (why.length) { pend = []; launch(packet, n, why); }
      }
    }
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

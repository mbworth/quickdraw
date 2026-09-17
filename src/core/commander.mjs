// The commander split: a scripted reflex answers every packet at 0 ms from a parameter set, while an API model (the commander) runs
// in the background on its own clock, reads the latest packet, and returns the next parameter set (+ a note). Knows no game: the
// reflex, the order-language decode, the params, their schema and apply() all come from the game's policy/.
import { answered } from './model.mjs';

const zero = () => ({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 });
const add = (a, b) => { for (const k of Object.keys(a)) a[k] += b?.[k] || 0; return a; };
const toolInput = res => (res.raw?.content || []).find(b => b.type === 'tool_use')?.input ?? null;
const fmt = v => (v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// F: what the commander's own last parameter set did — the diff it made, how long it has been in force, and how many reflex
// orders it actually changed (the reflex is re-run on the old set to compare). Params are opaque here: no game knowledge.
export function feedbackLayer({ setSeq = null, sinceN = 0, prev = null, cur = null, differed = 0, last = null } = {}) {
  if (setSeq === null) return 'F none';
  const keys = [...new Set([...Object.keys(cur || {}), ...Object.keys(prev || {})])];
  const diff = keys.filter(k => JSON.stringify(prev?.[k]) !== JSON.stringify(cur?.[k])).map(k => `${k} ${fmt(prev?.[k])}>${fmt(cur?.[k])}`);
  let s = `F set ${setSeq} in force ${sinceN} decisions: ${diff.length ? diff.join(' ') : 'unchanged'} | orders differed ${differed}/${sinceN}`;
  if (last) s += ` | ${`last: ${last.o} / was ${last.was}`.slice(0, 200)}`;
  return s;
}

// commanderModel({reflex, decode, commander, params, apply, everyMs, clock, log}) → callModel({packet, signal, onOrders})
// The cadence is checked on each reflex call (no timers of its own): a new commander call starts when none is in flight and either
// this is the first call or everyMs has passed since the last one started. Its note, usage/cost and a small summary ride out on the
// first reflex result after it lands.
export function commanderModel({ reflex, decode, commander, params, apply, everyMs = 5000, clock = { now: () => Date.now() }, log = () => {} }) {
  let cur = params, inFlight = null, ac = null, seq = 0, reflexN = 0, lastStartT = null;
  let note = null, usage = zero(), spend = 0, summary = null;
  let prev = null, setSeq = null, sinceN = 0, differed = 0, last = null;   // the F layer's state
  const feedback = () => feedbackLayer({ setSeq, sinceN, prev, cur, differed, last });

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
      if (typeof input.n === 'string') note = input.n;
      summary = { seq: n, input, stop: res.stop, latencyMs: res.latencyMs, apiPacketN: atN, feedback: F };
    })().finally(() => { if (ac === my) { ac = null; inFlight = null; } });
    inFlight = p;
  }

  async function callModel({ packet, signal, onOrders = null } = {}) {
    const t0 = clock.now(), n = ++reflexN;
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

// One Messages API call per decision: forced tool (or, --reply text, one line of text), cached prefix, no history, no retries.
import Anthropic from '@anthropic-ai/sdk';

export const isHaiku = model => /haiku/i.test(model);

export function buildRequest({ model, system, tool, toolName, toolDescription, thinking = 'adaptive', effort = 'low', reply = 'tool', stream = false, packet, maxTokens = 4096 }) {
  const req = {
    model,
    max_tokens: reply === 'text' ? 400 : maxTokens,   // a text reply is one order line; 400 caps a runaway
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: packet }],
  };
  if (reply !== 'text') {   // --reply text: no tool at all; the forced tool call costs ~29 output tokens of framing per call (measured 2026-09-14), the text costs only its own tokens
    req.tools = [{ name: toolName, description: toolDescription, input_schema: tool, strict: true, ...(stream ? { eager_input_streaming: true } : {}) }];   // --stream: partial tool input as it is generated, not buffered to valid JSON
    req.tool_choice = { type: 'tool', name: toolName, disable_parallel_tool_use: true };
  }
  if (!isHaiku(model)) {
    if (thinking === 'off') req.thinking = { type: 'disabled' };
    else { req.thinking = { type: 'adaptive' }; req.output_config = { effort }; }
  }
  return req;
}

export function cost(usage, price) {
  if (!usage || !price) return 0;
  const f = (n, p) => ((n || 0) * (p || 0)) / 1e6;
  return f(usage.input_tokens, price.input) + f(usage.cache_creation_input_tokens, price.cacheWrite) + f(usage.cache_read_input_tokens, price.cacheRead) + f(usage.output_tokens, price.output);
}

export const pickUsage = u => u ? { input_tokens: u.input_tokens || 0, cache_creation_input_tokens: u.cache_creation_input_tokens || 0, cache_read_input_tokens: u.cache_read_input_tokens || 0, output_tokens: u.output_tokens || 0 } : null;

export function classifyError(err) {
  if (err instanceof Anthropic.APIUserAbortError) return 'timeout';
  if (err instanceof Anthropic.RateLimitError) return 'error:rate_limit';
  if (err instanceof Anthropic.APIConnectionError) return 'error:connection';
  if (err instanceof Anthropic.APIError) return `error:status_${err.status ?? 'unknown'}`;
  if (err?.name === 'AbortError') return 'timeout';
  return 'error:unknown';
}

// The default reading of the tool input: {act, cmds, note}. A game may pass its own decode (an order language, --ashfall-lang).
export const decodeCmds = input => ({ act: input.act !== false, orders: Array.isArray(input.cmds) ? input.cmds : [], note: typeof input.note === 'string' ? input.note : null });

export const answered = stop => stop === 'tool_use' || stop === 'text';   // the model returned something decodable

// extractO(partialJson) → {text, closed}: the value of the tool input's "o" string as far as the partial JSON goes, JSON escapes
// decoded; closed once its closing quote has arrived. Probe 2026-09-14: with eager_input_streaming the string arrives in ~7-17 deltas
// and each ';' lands 0.3-0.7 s before the final message; without it every command is in the last delta.
export function extractO(partial) {
  const m = /"o"\s*:\s*"/.exec(partial);
  if (!m) return { text: '', closed: false };
  let out = '', i = m.index + m[0].length;
  while (i < partial.length) {
    const ch = partial[i];
    if (ch === '"') return { text: out, closed: true };
    if (ch !== '\\') { out += ch; i++; continue; }
    const nx = partial[i + 1];
    if (nx === undefined) break;   // an escape cut mid-way: wait for more
    if (nx === 'u') { const hex = partial.slice(i + 2, i + 6); if (hex.length < 4) break; out += String.fromCharCode(parseInt(hex, 16)); i += 6; continue; }
    out += { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }[nx] ?? nx; i += 2;
  }
  return { text: out, closed: false };
}
// completeCmds(text, closed) → the ';'-separated commands known to be complete
export const completeCmds = (text, closed) => { const parts = text.split(';'); if (!closed) parts.pop(); return parts.map(x => x.trim()).filter(Boolean); };

// createModel(...) → callModel({packet, signal, onOrders}) → {act, orders, note, usage, stop, latencyMs, cost, raw?, error?, streamed}; stop is tool_use or text when answered
// stream: true streams the call and hands each complete command's decoded orders to onOrders as it closes; `streamed` counts the commands handed on.
// Cold calls write the cache and compile the strict schema: game 12's calls 1 and 2 timed out at 6 s, so every call
// before the first cache hit gets firstCallDeadlineMs.
export function createModel({ client, model, system, tool, toolName, toolDescription, thinking, effort, reply = 'tool', stream = false, decisionDeadlineMs = 6000, firstCallDeadlineMs = decisionDeadlineMs * 3, prices = {}, clock, warn = m => console.warn(m), decode = decodeCmds }) {
  let calls = 0, warm = false;
  const price = prices[model];
  if (reply === 'text' && decode === decodeCmds) throw new Error('--reply text needs a game decode for the text (--ashfall-lang true)');
  if (stream && (decode === decodeCmds || reply === 'text')) throw new Error('--stream needs the order language under the tool (--ashfall-lang true, --reply tool)');
  if (!price) warn(`no price for ${model} in config/prices.json; cost will be 0`);
  return async function callModel({ packet, signal, onOrders = null } = {}) {
    calls++;
    const req = buildRequest({ model, system, tool, toolName, toolDescription, thinking, effort, reply, stream, packet });
    const ac = new AbortController();
    const timer = clock.setTimeout(() => ac.abort(), warm ? decisionDeadlineMs : firstCallDeadlineMs);
    const sig = signal ? AbortSignal.any([ac.signal, signal]) : ac.signal;
    const t0 = clock.now();
    const out = { act: false, orders: [], note: null, usage: null, stop: 'error:unknown', latencyMs: 0, cost: 0, streamed: 0 };
    let partial = '';
    const feed = (text, closed) => { const cmds = completeCmds(text, closed); while (out.streamed < cmds.length) { const d = decode({ o: cmds[out.streamed++] }); if (d.orders.length && onOrders) onOrders(d.orders); } };
    try {
      let res;
      if (stream) {
        const s = client.messages.stream(req, { maxRetries: 0, signal: sig });
        s.on('streamEvent', ev => { if (ev.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta') { partial += ev.delta.partial_json; const { text, closed } = extractO(partial); feed(text, closed); } });
        res = await s.finalMessage();
      } else res = await client.messages.create(req, { maxRetries: 0, signal: sig });
      out.usage = pickUsage(res.usage);
      out.raw = { model: res.model, stop_reason: res.stop_reason, content: (res.content || []).map(b => (b.type === 'tool_use' ? { type: b.type, name: b.name, input: b.input } : b)) };   // full capture: thinking/text blocks and the tool input as written
      out.cost = cost(out.usage, price);
      if (out.usage.cache_read_input_tokens > 0) warm = true;
      const tu = (res.content || []).find(b => b.type === 'tool_use');
      if (reply === 'text' && res.stop_reason === 'end_turn') {
        out.stop = 'text';
        const d = decode({ o: (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') });
        out.act = d.act; out.orders = d.orders; out.note = d.note;
      } else if (res.stop_reason === 'tool_use' && tu && tu.input && typeof tu.input === 'object') {
        out.stop = 'tool_use';
        const d = decode(tu.input);
        out.act = d.act; out.orders = d.orders; out.note = d.note;
        if (stream && typeof tu.input.o === 'string') feed(tu.input.o, true);   // anything the partial scan did not hand on (exactly once per command)
      } else if (res.stop_reason === 'max_tokens') out.stop = 'max_tokens';
      else if (res.stop_reason === 'refusal') out.stop = 'refusal';
      else out.stop = `error:stop_${res.stop_reason}`;
      if (calls > 2 && out.usage && out.usage.cache_read_input_tokens === 0) warn(`call ${calls}: cache_read_input_tokens is 0; the prefix is not caching`);
    } catch (err) {
      out.stop = signal?.aborted ? 'aborted' : classifyError(err);   // the pilot's abort (game over) is not a deadline
      out.error = String(err?.message || err);
    } finally {
      clock.clearTimeout(timer);
      out.latencyMs = clock.now() - t0;
    }
    return out;
  };
}

// A model that never acts: for dry runs of the loop without a key.
export function nullModel() {
  return async () => ({ act: false, orders: [], note: null, usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }, stop: 'tool_use', latencyMs: 0, cost: 0 });
}

// scriptModel({decide, decode}) → callModel: a scripted policy in place of the API. decide(packetText) → {o, why}; `o` is decoded by the
// game's order language like a tool call, `why` rides in `note`. A packet the script cannot read is stop 'error:read', never a silent `-`.
export function scriptModel({ decide, decode, clock = { now: () => Date.now() } }) {
  const usage = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
  return async function callModel({ packet, onOrders = null } = {}) {
    const t0 = clock.now();
    try {
      const { o, why } = decide(packet);
      const d = decode({ o });
      if (d.orders.length && onOrders) onOrders(d.orders);
      return { act: d.act, orders: d.orders, note: why?.length ? why.join(' ') : null, usage: { ...usage }, stop: 'tool_use', latencyMs: clock.now() - t0, cost: 0, raw: { o }, streamed: onOrders ? d.orders.length : 0 };
    } catch (err) {
      return { act: false, orders: [], note: null, usage: { ...usage }, stop: 'error:read', error: String(err?.message || err), latencyMs: clock.now() - t0, cost: 0 };
    }
  };
}

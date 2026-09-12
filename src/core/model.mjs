// One Messages API call per decision: forced tool, cached prefix, no history, no retries.
import Anthropic from '@anthropic-ai/sdk';

export const isHaiku = model => /haiku/i.test(model);

export function buildRequest({ model, system, tool, toolName, toolDescription, thinking = 'adaptive', effort = 'low', packet, maxTokens = 4096 }) {
  const req = {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools: [{ name: toolName, description: toolDescription, input_schema: tool, strict: true }],
    tool_choice: { type: 'tool', name: toolName, disable_parallel_tool_use: true },
    messages: [{ role: 'user', content: packet }],
  };
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

// createModel(...) → callModel({packet, signal}) → {act, orders, note, usage, stop, latencyMs, cost, error?}
// Cold calls write the cache and compile the strict schema: game 12's calls 1 and 2 timed out at 6 s, so every call
// before the first cache hit gets firstCallDeadlineMs.
export function createModel({ client, model, system, tool, toolName, toolDescription, thinking, effort, decisionDeadlineMs = 6000, firstCallDeadlineMs = decisionDeadlineMs * 3, prices = {}, clock, warn = m => console.warn(m) }) {
  let calls = 0, warm = false;
  const price = prices[model];
  if (!price) warn(`no price for ${model} in config/prices.json; cost will be 0`);
  return async function callModel({ packet, signal } = {}) {
    calls++;
    const req = buildRequest({ model, system, tool, toolName, toolDescription, thinking, effort, packet });
    const ac = new AbortController();
    const timer = clock.setTimeout(() => ac.abort(), warm ? decisionDeadlineMs : firstCallDeadlineMs);
    const sig = signal ? AbortSignal.any([ac.signal, signal]) : ac.signal;
    const t0 = clock.now();
    const out = { act: false, orders: [], note: null, usage: null, stop: 'error:unknown', latencyMs: 0, cost: 0 };
    try {
      const res = await client.messages.create(req, { maxRetries: 0, signal: sig });
      out.usage = pickUsage(res.usage);
      out.cost = cost(out.usage, price);
      if (out.usage.cache_read_input_tokens > 0) warm = true;
      const tu = (res.content || []).find(b => b.type === 'tool_use');
      if (res.stop_reason === 'tool_use' && tu && tu.input && typeof tu.input === 'object') {
        out.stop = 'tool_use';
        out.act = tu.input.act !== false;
        out.orders = Array.isArray(tu.input.cmds) ? tu.input.cmds : [];
        out.note = typeof tu.input.note === 'string' ? tu.input.note : null;
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

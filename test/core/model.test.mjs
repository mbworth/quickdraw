import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createModel, buildRequest, cost, extractO, completeCmds } from '../../src/core/model.mjs';
import { virtualClock } from '../../src/core/clock.mjs';

const tool = { type: 'object', properties: { act: { type: 'boolean' }, cmds: { type: 'array' } }, required: ['act', 'cmds'], additionalProperties: false };
const usage = { input_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 4000, output_tokens: 100 };
const reply = (input, stop_reason = 'tool_use') => ({ stop_reason, usage, content: input ? [{ type: 'tool_use', name: 'orders', input }] : [] });
const fake = fn => ({ messages: { create: fn } });
const prices = { 'claude-sonnet-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 } };
const mk = (client, over = {}) => {
  const clock = virtualClock();
  const warnings = [];
  const callModel = createModel({ client, model: 'claude-sonnet-5', system: 'S', tool, toolName: 'orders', toolDescription: 'd', thinking: 'adaptive', effort: 'low', decisionDeadlineMs: 6000, firstCallDeadlineMs: 6000, prices, clock, warn: w => warnings.push(w), ...over });
  return { callModel, clock, warnings };
};

test('request shape per model', () => {
  const base = { system: 'S', tool, toolName: 'orders', toolDescription: 'd', packet: 'P' };
  const s = buildRequest({ ...base, model: 'claude-sonnet-5' });
  assert.deepEqual(s.system, [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(s.tools, [{ name: 'orders', description: 'd', input_schema: tool, strict: true }]);
  assert.deepEqual(s.tool_choice, { type: 'tool', name: 'orders', disable_parallel_tool_use: true });
  assert.deepEqual(s.messages, [{ role: 'user', content: 'P' }]);
  assert.equal(s.max_tokens, 4096);
  assert.deepEqual(s.thinking, { type: 'adaptive' });
  assert.deepEqual(s.output_config, { effort: 'low' });
  const off = buildRequest({ ...base, model: 'claude-opus-5', thinking: 'off' });
  assert.deepEqual(off.thinking, { type: 'disabled' });
  assert.equal(off.output_config, undefined);
  const h = buildRequest({ ...base, model: 'claude-haiku-4-5' });
  assert.equal(h.thinking, undefined);
  assert.equal(h.output_config, undefined);
});

test('tool_use parses act, cmds and note; act:false is a no-op', async () => {
  let seen;
  const { callModel } = mk(fake(async (req, opts) => { seen = { req, opts }; return reply({ act: false, cmds: [{ cmd: 'x' }], note: 'n' }); }));
  const r = await callModel({ packet: 'P' });
  assert.equal(seen.opts.maxRetries, 0);
  assert.ok(seen.opts.signal instanceof AbortSignal);
  assert.equal(r.stop, 'tool_use');
  assert.equal(r.act, false);
  assert.deepEqual(r.orders, [{ cmd: 'x' }]);
  assert.equal(r.note, 'n');
  assert.deepEqual(r.usage, usage);
});

test('max_tokens and refusal are distinct stops and never retried', async () => {
  let calls = 0;
  const { callModel } = mk(fake(async () => { calls++; return calls === 1 ? reply({ act: true }, 'max_tokens') : reply(null, 'refusal'); }));
  assert.equal((await callModel({ packet: 'P' })).stop, 'max_tokens');
  assert.equal((await callModel({ packet: 'P' })).stop, 'refusal');
  assert.equal(calls, 2);
});

test('abort at the decision deadline is a timeout', async () => {
  const { callModel, clock } = mk(fake((req, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Anthropic.APIUserAbortError())))));
  const p = callModel({ packet: 'P' });
  await clock.advance(6000);
  const r = await p;
  assert.equal(r.stop, 'timeout');
  assert.equal(r.latencyMs, 6000);
});

test('a cold call gets the longer deadline', async () => {
  const { callModel, clock } = mk(fake((req, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Anthropic.APIUserAbortError())))), { firstCallDeadlineMs: 15000 });
  const p = callModel({ packet: 'P' });
  await clock.advance(6000);
  let settled = false; p.then(() => (settled = true));
  await clock.flush();
  assert.equal(settled, false, 'still waiting past the normal deadline');
  await clock.advance(9000);
  assert.equal((await p).stop, 'timeout');
});

test('the caller\'s abort is recorded as aborted, not as a deadline timeout', async () => {
  const { callModel, clock } = mk(fake((req, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Anthropic.APIUserAbortError())))));
  const ac = new AbortController();
  const p = callModel({ packet: 'P', signal: ac.signal });
  await clock.advance(100); ac.abort();
  assert.equal((await p).stop, 'aborted');
});

test('every call before the first cache hit keeps the long deadline; a missing price warns once', async () => {
  let n = 0;
  const { callModel, clock, warnings } = mk(fake((req, { signal }) => { n++; return n === 3 ? reply({ act: false, cmds: [] }) : new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Anthropic.APIUserAbortError()))); }), { firstCallDeadlineMs: 15000, model: 'claude-unknown' });
  assert.equal(warnings.length, 1); assert.match(warnings[0], /no price/);
  for (let i = 0; i < 2; i++) { const p = callModel({ packet: 'P' }); await clock.advance(15000); assert.equal((await p).stop, 'timeout'); assert.equal((await p).latencyMs, 15000, `call ${i + 1} still cold`); }
  assert.equal((await callModel({ packet: 'P' })).cost, 0);
  const p = callModel({ packet: 'P' }); await clock.advance(6000);
  assert.equal((await p).stop, 'timeout', 'warm now: the normal deadline applies');
});

test('error classes map to stop reasons', async () => {
  const errs = [new Anthropic.RateLimitError(429, {}, 'rl', new Headers()), new Anthropic.APIConnectionError({ message: 'x' }), new Anthropic.InternalServerError(500, {}, 'x', new Headers()), new Error('boom')];
  const { callModel } = mk(fake(async () => { throw errs.shift(); }));
  const stops = [];
  for (let i = 0; i < 4; i++) stops.push((await callModel({ packet: 'P' })).stop);
  assert.deepEqual(stops, ['error:rate_limit', 'error:connection', 'error:status_500', 'error:unknown']);
});

test('cost prices the four usage fields; warns on a cold cache after call 2', async () => {
  assert.equal(cost({ input_tokens: 1e6, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6, output_tokens: 1e6 }, prices['claude-sonnet-5']), 14.7);
  const cold = { ...usage, cache_read_input_tokens: 0 };
  const { callModel, warnings } = mk(fake(async () => ({ stop_reason: 'tool_use', usage: cold, content: [{ type: 'tool_use', input: { act: false, cmds: [] } }] })));
  for (let i = 0; i < 3; i++) await callModel({ packet: 'P' });
  assert.equal(warnings.length, 1);
  assert.equal((await callModel({ packet: 'P' })).cost, cost(cold, prices['claude-sonnet-5']));
});

test('--reply text: no tool in the request, the text blocks decode as {o}, stop is text', async () => {
  const base = { system: 'S', tool, toolName: 'orders', toolDescription: 'd', packet: 'P' };
  const t = buildRequest({ ...base, model: 'claude-sonnet-5', reply: 'text' });
  assert.equal(t.tools, undefined); assert.equal(t.tool_choice, undefined); assert.equal(t.max_tokens, 400);
  assert.deepEqual(t.thinking, { type: 'adaptive' });
  const decode = input => ({ act: input.o !== '-', orders: input.o === '-' ? [] : [{ cmd: input.o }], note: null });
  const text = (s, stop_reason = 'end_turn') => ({ stop_reason, usage, content: [{ type: 'text', text: s }] });
  const { callModel } = mk(fake(async () => text('t 12 tr 3')), { reply: 'text', decode });
  const r = await callModel({ packet: 'P' });
  assert.equal(r.stop, 'text'); assert.equal(r.act, true); assert.deepEqual(r.orders, [{ cmd: 't 12 tr 3' }]);
  assert.deepEqual(r.raw.content, [{ type: 'text', text: 't 12 tr 3' }]);
  const { callModel: noop } = mk(fake(async () => text('-')), { reply: 'text', decode });
  assert.equal((await noop({ packet: 'P' })).act, false);
  const { callModel: cut } = mk(fake(async () => text('t 12', 'max_tokens')), { reply: 'text', decode });
  assert.equal((await cut({ packet: 'P' })).stop, 'max_tokens');
  assert.throws(() => mk(fake(async () => text('x')), { reply: 'text' }), /needs a game decode/);
});

test('extractO reads the "o" string out of partial tool-input JSON, escapes decoded, closed on the closing quote', () => {
  assert.deepEqual(extractO('{"o'), { text: '', closed: false });
  assert.deepEqual(extractO('{"o": "t 12 tr 3; am ar'), { text: 't 12 tr 3; am ar', closed: false });
  assert.deepEqual(extractO('{"o": "a \\"b\\" c\\'), { text: 'a "b" c', closed: false }, 'an escape cut mid-way waits');
  assert.deepEqual(extractO('{"o": "x\\u00e9y; z"}'), { text: 'xéy; z', closed: true });
  assert.deepEqual(completeCmds('t 12 tr 3; am ar', false), ['t 12 tr 3']);
  assert.deepEqual(completeCmds('t 12 tr 3; am army 65,25', true), ['t 12 tr 3', 'am army 65,25']);
  assert.deepEqual(completeCmds(' ; ', true), []);
});

test('--stream: eager tool input, each command handed to onOrders as it closes, the tail exactly once after the final message', async () => {
  const decode = input => ({ act: input.o !== '', orders: input.o ? input.o.split(';').map(x => x.trim()).filter(Boolean).map(cmd => ({ cmd })) : [], note: null });
  const deltas = ['{"o": "t 12', ' tr 3; am ar', 'my 65,25; g idle', '"}'];
  const final = { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', name: 'orders', input: { o: 't 12 tr 3; am army 65,25; g idle' } }] };
  let seenReq;
  const client = { messages: { stream: (req, opts) => { seenReq = { req, opts }; const handlers = {}; return {
    on(name, fn) { handlers[name] = fn; },
    async finalMessage() { for (const d of deltas) handlers.streamEvent({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: d } }); return final; },
  }; } } };
  const got = [];
  const { callModel } = mk(client, { stream: true, decode });
  const r = await callModel({ packet: 'P', onOrders: orders => got.push(orders.map(o => o.cmd).join('|')) });
  assert.equal(seenReq.req.tools[0].eager_input_streaming, true);
  assert.equal(seenReq.opts.maxRetries, 0);
  assert.deepEqual(got, ['t 12 tr 3', 'am army 65,25', 'g idle']);
  assert.equal(r.streamed, 3); assert.equal(r.stop, 'tool_use'); assert.equal(r.orders.length, 3);
  assert.throws(() => mk(fake(async () => reply({ act: true, cmds: [] })), { stream: true }), /needs the order language/);
});

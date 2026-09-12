# Handoff — 2026-09-12

State of Quickdraw after the first implementation pass and the first live game. For the next session and for the adversarial review team. Nothing is committed; `git status` shows the whole build as untracked.

## Where things stand

| milestone | state |
|---|---|
| M0-M3 | done. `npm test`: 91 tests, 3 skipped (need `ASHFALL_LOCAL`, `ASHFALL_LIVE=1`, or a key), < 1 s on virtual time |
| M4 rehearsal | done on Sonnet only (the key is Sonnet-only): run 3 legal 16/16, sensible 14/16; `test/games/ashfall/rehearsal.md` |
| M5 live | done: checklist (games 24-25), smoke (27), game 12 = hub game 28, loss at 4:00; `runs/ashfall-28.jsonl` |
| M6 measurement | done: `bin/pace.mjs`, `bin/replay.mjs` (all 85 game-12 packets, skipped calls included, replay byte for byte; this proves encode is pure over the refs, not that the API saw the packet) |
| M7 iterate | not started. This document is its plan |
| review | done: `docs/reviews/2026-09-12-harness.md`, every item fixed; verified live in games 13-15 (hub 29-31): 0 reconnects, 0 crashes, no pregame calls, clean stop-file exits |
| games 13-15 | prompt work, asked for after game 13: game 15 (`prompts/ashfall/game15-sonnet.md`, sha `cc08728a`) **won** at 7:37 by killing the core. It is the new baseline prompt for M7 |

Game 12 pace row (`node bin/pace.mjs runs/ashfall-28.jsonl`): 19.4 decisions per game-minute, 8 timeouts, reaction p50 4.0 s / p90 7.2 s (event-anchored, n=35), model p50 2.0 s, 116 output tokens median, **packet 660 real tokens p50** (481 est + ~180 framing; the §1 target of ≤ 600 real is not met), cache 100% but 0 tokens written (the prefix came from the game-27 smoke: a fresh prompt pays ~$0.02 more), orders kept 27.9% (80 of 97 drops are `noore`), 4 rejected, 0 rate-limited, 0 reconnects, $0.32. About 1.3 s p50 of reaction was queue time (arrival → tick → decision start); the run predates the split, so `waitP50`/`queueP50` are null for it.

## Direction (set after game 12)

Harness, not strategy. The prompt `prompts/ashfall/game15-sonnet.md` (sha `cc08728a…`, the first Quickdraw win) is the **frozen baseline** for every experiment; do not tune it, do not write strategy lessons. Iterate on efficiency: reaction time, decisions per minute, and condensing the packet (the Shannon question: how much of each packet is information the decision needs). Win rate is a confirmation metric only.

## Next steps, in order (one variable per game)

1. **Instrumentation** (mostly done in the review fixes). `call` lines now carry `anchor` and the split `waitMs` (arrival → tick), `queueMs` (tick → decision start), `encodeMs apiMs expandMs validateMs sendMs`; `pace` prints `waitP50`, `queueP50`, `sendP50`, `reactionSamples`, `timeouts`, `cacheWriteTokens`. Still to do, as post-processing over run files (no format change): tokens per layer from `replayDecision(...).layers` (on game 12 the `fields` layer is ~150 of 536 est tokens and identical every packet) and **novelty** = share of packet lines identical to the previous decision's packet (game 12: median 70%). Then `--row`.
2. **Output length** (X2 step 1), one game each: `--thinking off` (note: also removes `output_config`); drop `note` from the schema (new schema sha → grammar recompile and a cache write); order cap 15 → 8. Measure model p50 and no-op share.
3. **Tick on event arrival**: today an event waits for the next 500 ms `state` push (T2), then for any call in flight, then the refresh floor. Add `--event-tick` (fire a tick on event arrival with the latest snapshot) and measure the reaction split from step 1. 145 of 326 trigger outcomes in game 12 were `coalesced`.
4. **Overlapping calls**: allow a second call to start while the first is in flight, validate each against the newest state on return, drop by `stale`. Design question: ordering of sends and `lastOrders` across two in-flight decisions.
5. **Streaming per-cmd dispatch** (M8 in REQ): `eager_input_streaming`, dispatch each cmd as its JSON closes; open question is validate on a partial list.
6. **Packet ablation**, stopping rule = real-token `packetP50` and no-op share over three games (kept share cannot move: 80 of 97 drops are `noore`, a property of the frozen prompt): fields layer (~150 of 536 tokens, constant), remembered, ids on big clusters, coarser positions. The tokenizer is the channel: 1.34 chars/token, digits and punctuation dominate.
7. **Order size**: game 14's 27-id move orders raised output tokens and timeouts (39 vs 5-7). Measure ids per order; try `army`/cluster labels as the default selector in the tool description (schema unchanged) or a client-side rewrite of a full-army id list to `army`.
8. Then `pace --row`, per-class trigger stats, and ≥ 20 games on the final config for win rate.

## What the review team should attack

Reviewed 2026-09-12: findings in `docs/reviews/2026-09-12-harness.md` (S1 items 1–4 before the next live game; 5–7 before another pace row; 8–9 before any M7 experiment). Original target list below.

- **Concurrency**: `decide` loop, dirty re-entry, `markDone` ordering, `finish` racing an in-flight call, the new one-refresh wait on an ended state (`src/core/pilot.mjs`).
- **Trigger engine**: cooldown before coalescing, edge memory across `resume`, deadline never firing twice, heartbeat alignment (`src/core/triggers.mjs`).
- **Recorder**: one sync-flushed queue instead of a stream; drop-past-4 MB backpressure; refs stay valid under `on-decision`/`sampled` (`src/core/record.mjs`).
- **Transport**: reconnect holds a ref'd timer; pending cmds resolve `disconnected`; event buffer caps per kind; `seq` is per game across both teams (`src/games/ashfall/ctl.mjs`).
- **Tool schema**: ids are strings only because the `integer|string` union made the strict grammar too large (probe with `messages.create`, not `countTokens`); 11 variants + enums + nullables + `note` compile (`src/games/ashfall/tool.mjs`).
- **Expand sugar**: pasted cluster labels resolve to ids within r=8; `idle` in `workers` → idle harvesters; repeat suppression only for build/research/cancel/rally across decisions (`src/games/ashfall/expand.mjs`).
- **Validate** threads a provisional bank; is anything it drops something the server would have accepted (`noore` timing at 500 ms granularity)?
- **Measurement honesty**: `pace` excludes decision 1, counts reaction only on decisions with sent orders, reports raw `input_tokens` (includes ~200 framing). Is kept share the right proxy when most drops are client-side and free?
- **Boundary**: `test/core/boundary.test.mjs` walks imports and runs the core suite in a copy without `src/games/ashfall`.
- **Generality** (X5): what in core would break for a second game? Candidates: `clocks.game` assumed seconds; `stale` uses game time when present, wall otherwise; core trigger classes `heartbeat`/`deadline`/`resume`.

## Known defects fixed today (verify the fixes)

- Review fixes (all in `docs/reviews/2026-09-12-harness.md`, untested live): reconnect single-flight + attempt cap + `close` → `transport` finish; request timeout 10 s; heartbeat rides the next tick and always reschedules; no heartbeat calls in pregame; `Object.hasOwn` on every model-string lookup; per-cmd send results; `--full-every` wired; rehearsal shares `applyOrders`; SIGINT finishes cleanly (exit 130, second Ctrl-C hard exits).
- `--stale-after` default 2 s dropped every order (model latency 2.3-2.9 s); now decision deadline + 2 s.
- Ended state reached the core before the adapter's `done`: outcome recorded `{}`; adapter now emits `done` first, core waits one refresh.
- Calls 1-2 timed out at 6 s on the cold cache write; every call before the first cache hit now gets 3× the deadline.
- Reconnect backoff on unref'd timers let the process exit mid-reconnect; a ref'd timer now spans the reconnect.

## Environment

- `.env` (gitignored): `ANTHROPIC_API_KEY` (**Sonnet only**), `ASHFALL_HUB` (wss://…), `ASHFALL_KEY`. `ASHFALL_LOCAL=~/workspace/ashfall_sector` enables the local-hub tests and fixture capture.
- `.gitignore` in the working tree ignores `prompts/` (pre-existing edit, not mine): `prompts/ashfall/game12-sonnet.md` will not be added by `git add .` until that line goes.
- Account record: games 24, 25 (checklist, conceded), 27 (smoke, abandoned), 28 (game 12) are scripted losses.
- Live game cost ≈ $0.08 per game-minute at the current config.

## Commands

```
npm test
node bin/pilot.mjs --game mock --model none
ASHFALL_LOCAL=../ashfall_sector npm run test:ashfall
ASHFALL_LIVE=1 ASHFALL_CONCEDE_STALE=1 node --test test/games/ashfall/live.test.mjs      # live checklist, concedes leftovers
node bin/rehearse.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game12-sonnet.md --every 3
node bin/pilot.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game12-sonnet.md --stop-file /tmp/qd-stop --ashfall-concede-stale true
node bin/pace.mjs runs/ashfall-28.jsonl
node bin/replay.mjs runs/ashfall-28.jsonl all
```

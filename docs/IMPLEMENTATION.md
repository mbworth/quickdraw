# Quickdraw implementation plan

Turns `REQUIREMENTS.md` into milestones. Each names its files, the interfaces it fixes, its tests, and the requirement ids it closes. A milestone is done when its tests pass and its exit line is true. Revised 2026-09-12 after `reviews/2026-09-12-implementation-plan.md`.

Order: M0 scaffold → M1 core against the mock game → M2 Ashfall transport → M3 Ashfall coder → M4 offline rehearsal → M5 first live game → M6 measurement → M7 iterate. M2 can start alongside M1. M3 needs fixtures, which M2's `bin/record.mjs` captures from the local hub or live.

## Status (2026-09-14)

| milestone | state |
|---|---|
| M0 scaffold | done: `npm test`, `bin/pilot.mjs` parse/load, `config/prices.json`, `.env` loader |
| M1 core + mock | done: 41 core tests on virtual time (~0.25 s); `node bin/pilot.mjs --game mock --model none` plays to `done` |
| M2 transport | done: `ctl`, `auth`, `bucket`, `scrub`, `bin/record.mjs`; integration test green on the local hub; 48 fixtures (4 min, opening → wave) committed |
| M3 adapter | done: coder, tool, expand, validate, index; goldens + properties over every fixture; busiest packet ≈ 260 est tokens |
| M4 rehearsal | done on Sonnet (the key is Sonnet-only): 3 runs, run 3 legal 16/16, sensible 14/16, median latency 2.75 s, cache hits 15/16, $0.09; scores in `test/games/ashfall/rehearsal.md`. Divisor calibrated at 1.34 chars/token. Opus/Haiku cache checks not possible with this key |
| M5 live game | done: checklist green (games 24-25, conceded), smoke (game 27, 40 decisions), game 12 = hub game 28, loss at 4.0 min, `runs/ashfall-28.jsonl`, notes row written |
| M6 measurement | done: `pace` row for game 12 in `notes/ashfall/games.md`; `replay` reproduces all 77 game-12 packets byte for byte |
| M7 iterate | in progress (games 13-31, 2026-09-14): packet ablation, decision bench, trajectory replay, layer-sensitivity and trigger-class tools built; order language, overlapping calls (`--overlap 2`), event tick and streaming dispatch (`--stream`) adopted: reaction p50 5.6 → 2.3 s, first order 2.2 s, output 101 → 38 tokens; output floor (tool framing), a third slot and a reserved slot measured and left off; next is the win-rate campaign; see `HANDOFF.md` |
| M8 scripted policy | done (2026-09-14): `src/games/ashfall/read.mjs` (packet text → facts, strict), `src/games/ashfall/policy/game38.mjs` (the game38 plan as code), `scriptModel` + `--model script:<name>` in every tool, windowed plan agreement and `--diff` in `bin/trajectory.mjs`. Bench 16/16; live 10 of 11 at $0 (games 39–49) against Sonnet 4 of 5 (games 50–54); three bench cases from the model's departures; `--ashfall-plan-marks` + `game55-sonnet.md` lift two of them offline, game 55 won 4:54 |

Deviations from the plan as written, and why:
- **Recorder** uses one ordered in-memory queue flushed with `fs.writeSync` (immediately for `call`/`decision`/`result`/`done`, every 250 ms or 64 KB for `state`) instead of a `createWriteStream`: a stream cannot be flushed synchronously from `uncaughtException`, and two writers on one fd would reorder lines and break refs. Writes loop on the byte count so a short write cannot truncate a line.
- **`--model none`** runs the loop with a model that never acts (`act:false`). It is the only way to exercise a real adapter without a key; tests still inject a stub through `runPilot`. **`--model script:<name>`** (M8) runs it with a scripted policy that does act, from the packet text alone, at $0.
- **Core-owned trigger classes** `heartbeat`, `deadline` and `resume` (after a reconnect) exist beside the adapter's classes; they rank below all (`heartbeat`, `resume`) or above all (`deadline`).
- **`--stale-after` defaults to decision deadline + 2 s** (8 s), not 2 s: the live smoke (game 26) dropped nearly every order as stale at 2 s because model latency alone is 2.3-2.9 s.
- **Stale/ended drops** both record `dropped:stale`; a call that returns after `done` is recorded with `skipped:ended` and nothing is sent.
- **The `call` line's `triggers` carry `native`** so `replay` needs no separate event lines.
- **Exit codes**: 0 won, 1 lost or unknown, 2 stop-file, 3 draw.
- **`--full-every`** is wired through pilot and replay (decision 1 is always full). Game 12 ran with 0.
- **Game 12 harness findings**: the ended state reached the core before the adapter's `done`, so the outcome was recorded as `{}` (fixed: the adapter emits `done` first and the core waits one refresh on an ended state); calls 1-2 hit the 6 s deadline on the cold cache write (fixed: `firstCallDeadlineMs` = 3× deadline); reaction p50 exceeds model p50 by 2 s through coalescing, the M7 lever.
- **Strict schema size**: the API refused the first `orders` schema ("compiled grammar is too large"). Ids are now strings only; enums, nullables, `note` and 11 variants fit once the `integer|string` union is gone. Probe with `messages.create`, not `countTokens`, which does not compile the grammar.
- **Tokens**: packets tokenize at 1.34 chars/token, not 3.5; a cache-hit call's `input_tokens` carries ~200 tokens of fixed framing on top of the packet.
- **`seq` scope** (open question in §9/§14): the hub numbers events per game across both teams, so gaps are the other side's events. The client counts them and does not warn.
- Events arriving between two `state` pushes are batched into the next state tick (T2). With Ashfall's 500 ms push that adds up to 500 ms to reaction time; an event-driven tick is an M7 candidate.

## Stack

- Node ≥ 20.6 (dev box runs 20.20), ESM, no build step, no TypeScript. JSDoc types on the contract only.
- Dependencies: `@anthropic-ai/sdk`, `ws`. Dev: none beyond `node --test`.
- Env: loaded in JS from `.env` when present; `--env-file` throws on a missing file in Node 20.
- Node 20 rules: every timer `.unref()`; every test `after()` tears down sockets and timers (no `--test-force-exit`); run `node --test test/` for discovery; no `parseArgs` (with `strict:false` it reads `--ashfall-size 200` as a boolean plus a positional).
- Scripts: `npm test`, `npm run test:ashfall` (needs `ASHFALL_LOCAL`), `npm run pilot -- --game ashfall …`, `npm run record -- --game ashfall …`.

## Interfaces fixed in M0

Seams between core and adapter. Changing one after M1 is a deliberate decision, noted in `PLAN.md`.

```js
// the contract, as JSDoc; the source of truth is docs/REQUIREMENTS.md §4 (no types file: it drifted)
/** @typedef {{cls:string, key:string, urgency?:number, native?:any, t:number, gt?:number}} Trigger */
/** @typedef {{lifecycle:'pregame'|'active'|'ended', phaseNative:string, clocks?:Record<string,number>, gameId:string, seat:string}} Header */
/** @typedef {{header:Header, native:any, t:number, idx:number}} Snapshot */
/** @typedef {{name:string, text:string, priority:number, full?:boolean, lines?:{text:string, priority:number}[]}} Layer */
/** @typedef {{cmd:string, [k:string]:any}} Cmd */              // discriminated by cmd
/** @typedef {{cmd:Cmd, reason:string}} Dropped */
/** @typedef {{ok:boolean, error?:string}} CmdResult */
/** @typedef {{outcome:{won?:boolean, draw?:boolean, rank?:number}, duration?:number, why:string}} Done */

/**
 * @typedef {object} Adapter
 * @prop {{name:string, classes:string[], cooldownMs?:Record<string,number>, orderCap:number,
 *         actionMode:'batch'|'single', toolName:string, toolDescription:string, refreshMs?:number}} meta
 * @prop {()=>Promise<void>} connect
 * @prop {(opts:object)=>Promise<{gameId:string, seat:string}>} seat
 * @prop {()=>Promise<void>} start
 * @prop {()=>Promise<void>} leave
 * @prop {()=>Promise<void>} concede
 * @prop {(ev:'state'|'event'|'done'|'disconnect'|'reconnect', fn:Function)=>void} on
 * @prop {(state:Snapshot)=>boolean} canAct
 * @prop {(state:Snapshot)=>{atMs:number, cls:string}|null} deadline
 * @prop {(state:Snapshot)=>Trigger[]} derive
 * @prop {(x:{state:Snapshot, prevDecisionState:Snapshot|null, triggers:Trigger[], lastOrders:{cmd:Cmd, ok:boolean, error?:string}[]})=>Layer[]} encode
 * @prop {object} tool                       // frozen literal JSON schema, discriminated union + act:boolean
 * @prop {(cmds:Cmd[], state:Snapshot)=>{cmds:Cmd[], dropped:Dropped[]}} expand
 * @prop {(cmds:Cmd[], state:Snapshot)=>{keep:Cmd[], dropped:Dropped[]}} validate
 * @prop {(cmds:Cmd[])=>Promise<CmdResult[]>} send
 */
// module: export function createAdapter(env, opts) → Adapter
```

Core injection points, so tests run offline on virtual time: `runPilot({adapter, callModel, clock, record, opts})`. `clock = {now, setTimeout, clearTimeout, setInterval}` from `src/core/clock.mjs`, threaded through triggers, model deadline, recorder, and handed to adapters that want it (bucket, backoff). `callModel({packet}) → {act, orders, note?, usage, stop, latencyMs}` is the only export of `model.mjs`; tests pass a stub through the same parameter.

## M0 — Scaffold

Files: `package.json`, `.env.example` (+ `ANTHROPIC_API_KEY`, `QUICKDRAW_MODEL`), `config/prices.json`, `src/core/{types,clock}.mjs`, `bin/pilot.mjs` (parse and load only), `test/` layout, `.gitignore` + `runs/`.

1. `npm init`; `"type":"module"`, `engines.node >=20.6`; scripts above.
2. Arg parser (~40 lines): `--k v`, `--k=v`, an explicit boolean list (`--thinking off` is a value; a bare boolean has no value), `--<game>-*` collected into an opts bag with the prefix stripped. Prints the resolved config.
3. Env loader: read `.env` if it exists, do not override existing env.
4. Adapter loader: name must match `/^[a-z0-9-]+$/`; resolve `new URL(`../src/games/${name}/index.mjs`, import.meta.url)`; on `ERR_MODULE_NOT_FOUND` check `err.url` equals the adapter path before reporting "no such game", otherwise rethrow.
5. `config/prices.json`: per model, four rates (input, cache write, cache read, output) per MTok.

Exit: `node bin/pilot.mjs --game mock --mock-seed 1` prints the config; a bad game name gives one line; a syntax error inside an adapter surfaces as itself.

## M1 — Core loop against the mock game

Files: `src/core/{triggers,digest,packet,model,record,pilot}.mjs`, `src/games/mock/index.mjs`, `test/core/*.test.mjs`, `test/games/mock/*.test.mjs`.

### triggers.mjs
- `createTriggers({classes, cooldownMs, heartbeatMs, refreshMs, deadlineMarginMs, clock, onFire})`.
- `tick({snapshot, events, derived}) → {fire:Trigger[]|null, outcomes:[{trigger, outcome}]}`: rank by `urgency ?? classIndex`; edge-detect derived `(cls,key)` (fire once, re-arm when absent); apply per-class cooldown with key-break; collapse repeats by `(cls,key)`; return the whole surviving set as one fire or null (T1, T2, T6).
- `canAct === false` → everything `suppressed:cannot-act` except a scheduled deadline fire at `atMs − margin` (T4).
- Heartbeat scheduled from `markStart()`; `markDone()` fires immediately if overdue, once (T3).
- In flight: `tick` stores the highest-ranked set as dirty; `takeDirty()` returns it and the pilot re-offers through `tick` (cooldowns apply) no sooner than `refreshMs` after the last start (T5).
- `suspend()` / `resume()` for disconnect: outcomes `suppressed:disconnected`; `resume` clears edge memory and forces one fire on the next `tick` (T7).
- Every outcome carries the event's arrival `t` for reaction-time measurement (T8).

### digest.mjs
- `diffById(prev, next, {lists:[{name, path, key?, fields?}]}) → {added, removed, changed}` per list; generic over any array of objects with an id.
- `rankAndCollapse(triggers, {classes, top}) → Trigger[]` with `count` on collapsed repeats. Used by the trigger engine and offered to adapters for rendering.

### packet.mjs
- `assemble(layers, {maxTokens, divisor, fullEvery, n}) → {text, kept, dropped, estTokens}` (P1, P3). Divisor is a parameter (P2).

### model.mjs
- `createModel({client, model, system, tool, toolName, thinking, effort, decisionDeadlineMs, prices, clock}) → callModel`.
- Request: `system:[{type:'text', text, cache_control:{type:'ephemeral'}}]`, `tools:[{name, description, input_schema, strict:true}]`, `tool_choice:{type:'tool', name, disable_parallel_tool_use:true}`, `messages:[{role:'user', content:packet}]`, `max_tokens:4096`; thinking per M2 (Haiku 4.5: neither field).
- `client.messages.create(req, {maxRetries:0, signal})` under one `AbortController` per decision at `decisionDeadlineMs` (M4). The caller decides whether to re-encode or skip; `callModel` never retries.
- Returns `{act, orders, note, usage, stop, latencyMs}`; `stop` one of `tool_use | max_tokens | refusal | timeout | error:<class>` mapped from `stop_reason`, `APIUserAbortError`, `RateLimitError`, `APIConnectionError`, others.
- Cost: `cost(usage) = Σ field × price[model][field]`; accumulated by the pilot (M6).
- Warns per call when `cache_read_input_tokens === 0` after call 2 (M3).

### record.mjs
- `createRecorder(path, {clock, statePolicy})`. `writeNow(kind, obj)` appends synchronously; `writeState(snapshot)` batches under the `all|on-decision|sampled` policy (250 ms / 64 KB); `flushAndClose()` on exit and on SIGINT/SIGTERM/`uncaughtException`/`unhandledRejection` (R1).
- Line one: config + `promptSha256` + `schemaSha256`.

### pilot.mjs
- `runPilot({adapter, callModel, clock, record, opts}) → Promise<{done:Done, exitCode}>`.
- On `state`: assign `idx`, record per policy, `derive`, gather events since the last tick, `triggers.tick`. On fire → `decide(set)`.
- `decide` is a loop, not recursion: `markStart`; encode against `prevDecisionState`; assemble; `callModel` (on `timeout` with dirty set: skip; without: re-encode once); `expand`; cap to `orderCap` (`dropped:cap`); `validate` against the newest snapshot; drop all if `lifecycle !== 'active'` or the encoded snapshot is older than `--stale-after` (default 2 s of game time, `dropped:stale`); `send`; record `call` with refs (R2), `decision`, `result`; `markDone`; `prevDecisionState = encodedSnapshot`; loop on `takeDirty()`.
- Budget: before each call, if projected cost ≥ `--max-usd` or decisions ≥ `--max-decisions`, record `budget-stop` and stop deciding; `--concede-on budget` is the only path to `concede`.
- `--stop-file`: polled on the clock; flush, `leave`, exit 2.
- Phases: `pregame` → `start()` once; `ended` or `done` → abort any in-flight decision before `send`, resolve.
- Latency split per decision: `encodeMs, apiMs, expandMs, validateMs, sendMs, totalMs`; plus `eventArrivalT` of the earliest trigger in the fired set.

### mock adapter (Q6)
- `createAdapter(env, {seed, timeline, faults})`. Data-driven: `timeline` is `[tMs, kind, payload]` (`state`, `event`, `done`); `faults` is `[{at, kind:'disconnect'|'rejectCmd'|'doneMidCall'|'deadline'}]`. Runs on the injected clock.
- Deliberately unlike Ashfall: turn-based with a per-turn deadline (`canAct` flips with `phaseNative`), `actionMode:'single'`, `orderCap:1`, outcome may be `draw`, no game clock (`gt` absent), classes `['turn','opponent','info']`, tool named `move`.
- `send` records orders and returns scripted results; it never mutates the world, so runs are deterministic.
- `encode` emits header p0, delta p0 (via `digest.diffById`), detail p2 with lines.

### tests (Q1)
- `triggers.test.mjs`: batching to one fire; cooldown and key-break; heartbeat period from start under a slow stub; deadline fire; cannot-act suppression; dirty re-entry respects cooldown and floor; suspend/resume forces one fire; edge re-arm.
- `digest.test.mjs`: added/removed/changed over id lists; collapse counts.
- `packet.test.mjs`: p0 never dropped; line trimming before layer; full-every.
- `model.test.mjs` with a fake client: request shape per model; `act:false`; `max_tokens` → truncated; refusal → never retried; abort at deadline → `timeout`; cost from the four fields.
- `record.test.mjs`: immediate lines land before a buffered state; signal handler flushes; policy `on-decision`.
- `pilot.test.mjs`: full loop on the mock with a stub `callModel`: a decision fires on a `turn` event; coalescing under a slow stub; stale drop when `doneMidCall`; `rejectCmd` reaches `lastOrders`; `disconnect` suspends and the first fresh state fires; budget stop without concede; the `call` line's refs resolve to the recorded lines; exit code on draw.
- `boundary.test.mjs` (Q5): walk `src/core/` imports transitively, assert none resolve under `src/games/`; run the core suite with `src/games/ashfall` temporarily renamed (skipped if absent).

Exit: `npm test` green on virtual time in well under a second; `node bin/pilot.mjs --game mock` plays a timeline to `done` and writes `runs/mock-<id>.jsonl`. Closes §4 as consumed by the core, T1–T8, P1–P4, M1–M7, R1–R2, Q1, Q5, Q6.

## M2 — Ashfall transport and fixtures

Files: `src/games/ashfall/{ctl,auth}.mjs`, `src/lib/bucket.mjs`, `bin/record.mjs`, `src/games/ashfall/scrub.mjs`, `test/games/ashfall/{ctl,scrub}.test.mjs`, `test/lib/bucket.test.mjs`.

### ctl.mjs
- `connect({host, auth, clock})` → client; `auth.mjs` has the keyed and open branches behind one call (§9 auth seam). Resolve `hello`.
- Correlation ids; `pending` map; game rejections resolve `{ok:false, error}`, transport failures reject.
- All frame writes go through one `bucket.take()` (20/s, burst 60), including `games/join/leave/start/say/state` and the reconnect handshake.
- `state` kept with receive `t`; event buffer collapses repeats by `(kind,key)` at insert with per-class capacity; `seq` gaps counted and logged.
- Reconnect: backoff `[500,1000,2000,5000]` on the injected clock, `join{game,team}`, emits `disconnect`/`reconnect`; pending cmds resolve `disconnected`.
- Startup: `games()` → `leave` non-target unfinished seats.

### bucket.mjs (`src/lib/`)
- `createBucket({rate, burst, clock})`; FIFO. Test on virtual time: 100 takes complete at exactly the expected virtual instants; burst honoured.

### record.mjs and scrub.mjs
- `bin/record.mjs --game ashfall --seconds 60 --out test/games/ashfall/fixtures/` against local (`ASHFALL_LOCAL`) or live (`ASHFALL_KEY`): creates a game vs scripted, records raw `state` and `event` lines, runs `scrub`, writes numbered fixtures.
- `scrub(state)`: allowlist of fields the coder, expand and validate read; renumber entity and game ids from 1; drop `name`, `seed`, `player`. `scrub.test.mjs` asserts every committed fixture has only allowlisted keys and matches none of `/ash_|@|[a-f0-9]{16}/` (Q5).

### tests
- Integration (Q3, gated): open-auth register, create 200 vs scripted, `hello`, `state` within 1 s, cmd round trip, forced `ws.terminate()` then rejoin resumes `state`, `leave`, a burst of 70 frames produces zero `rate limited` results.

Exit: integration green on the local hub; ≥ 3 minutes of scrubbed fixtures committed spanning opening, first contact, a wave, post-wave. Closes §9 transport, limits, reconnect, buffer, fixtures.

## M3 — Ashfall adapter

Files: `src/games/ashfall/{events,coder,tool,expand,validate,index}.mjs`, `src/lib/cluster.mjs`, `test/games/ashfall/{events,coder,expand,validate,tool}.test.mjs`, `test/games/ashfall/golden/{opening,firefight,late}.txt`.

- `events.mjs`: `toTrigger(ev)` per §9 classes; `derive(state)` predicates only, no memory (edge detection is core's).
- `coder.mjs`: `encode` renders the §9 layers; delta from `digest.diffById`; clustering from `lib/cluster` (greedy by type, r=8, integer centroids); one `ABBR` table.
- `tool.mjs`: the frozen literal schema: `$defs` per cmd variant with `cmd:{const}`, `additionalProperties:false`, all args required, optionals `[type,'null']`; top-level `{act:boolean, cmds:[...]}`. `tool.test.mjs` asserts the file is a literal (no runtime construction), the sha is stable across two imports, and every variant validates under a strict-mode checker.
- `expand.mjs`: `train count` fan-out clamped to `5 − queue.length` (`dropped:queue-full`), id coercion (`dropped:bad-id`), repeat suppression within a decision and against the last 2 decisions' pending orders (`dropped:repeat`).
- `validate.mjs`: the §9 rules, pure.
- `index.mjs`: `createAdapter(env, opts)` wiring `meta` (`classes`, cooldowns, `orderCap` 15, `actionMode` batch, `toolName` orders, `refreshMs` 500), header mapping, `canAct`, `deadline` null, `send` over `ctl`.

### tests (Q2)
- Goldens: three readable packets, `--update` rewrites, the diff is reviewed in the commit.
- Properties over every fixture: layer order and priorities; integers only; tokens ⊆ `ABBR` ∪ digits ∪ punctuation; no raw ids outside `type#id`; each `enemyVisible` entity rendered once; busiest fixture under `opts.packetMax`.
- Calibration: `countTokens({model, system:'', messages:[{role:'user', content:packet}]})` over the fixtures once (needs a key; skipped otherwise) writes `src/games/ashfall/calibration.json.new` and asserts the committed `calibration.json` (which the adapter reads) is within 10%.
- `events`, `expand`, `validate`: one test per rule.

Exit: `npm test` green; `node bin/replay.mjs` not yet, so `node -e` prints a fixture's packet for eyeballing. Closes §9 classes, encode, tool, expand, validate, lifecycle wiring, A14.

## M4 — Offline rehearsal

Files: `bin/rehearse.mjs`, `prompts/ashfall/game12-sonnet.md` (first draft), `test/games/ashfall/rehearsal.md` (hand scores).

1. Prompt draft: strategy carried from game 11 (anchor defence, expand early, crystal by 4 min, no guard-reflex chases), plus a **vocabulary section** that states the packet layers, the `ABBR` table, the `act:false` convention, and that `lastOrders` shows what took. Padded past 4096 tokens with the rules digest so the prefix caches on all three models (M3).
2. `bin/rehearse.mjs --game ashfall --fixtures … --model claude-sonnet-5`: for ~20 chosen fixture moments, run `encode` + `assemble` + real `callModel` + `expand` + `validate` with `send` stubbed; print packet, orders, dropped, usage, stop reason and latency; ~cents in total.
3. Score by hand in `rehearsal.md`: legal? sensible? what the packet hid that the model needed? Fix the coder or the prompt, rerun. Confirm `cache_read_input_tokens > 0` from call 2 on Sonnet, Opus and Haiku.
4. Record the median model latency and output tokens per decision; if the median is over 3 s, adjust output length (effort, order cap, note) before going live.

Exit: 20 rehearsed moments with no illegal orders and a hand verdict of "sensible" on ≥ 15; cache hits on all three models; prompt and schema shas frozen for game 12. Retires the "model can act on a coded packet" risk without a live game.

## M5 — First live game

1. Live checklist (Q4) on a throwaway game: keyed upgrade, `hello` with player, create 200 vs scripted, one order round trip, forced terminate, rejoin by account, `leave`. Both auth branches now exercised.
2. Smoke: `--model claude-haiku-4-5 --max-decisions 40 --stop-file /tmp/qd-stop` to `done` or stop. Fix whatever breaks in the adapter.
3. Game 12: `claude-sonnet-5`, heartbeat 3 s, decision deadline 6 s, packet 600, thinking adaptive low, `--concede-on never`.
4. Notes row by hand (pace comes in M6), including everything the packet hid that the model then got wrong.

Exit: one completed live game with a run file and a notes row.

## M6 — Measurement and replay

Files: `bin/pace.mjs`, `bin/replay.mjs`, `test/core/{pace,replay}.test.mjs`.

- `pace.mjs` first cut per R4 on a synthetic run with known numbers; fails the summary if cache hit rate after call 2 < 90%; decision 1 excluded from medians.
- `replay.mjs <run> <n>`: loads the adapter from the config line, resolves `stateRef`, `prevDecisionRef`, `triggerRefs`, `lastOrders`, re-runs `encode` + `assemble`, diffs against the recorded packet (R3).

Exit: `pace` row for game 12; `replay` reproduces every game-12 packet byte for byte.

## M7 — Iterate

Status 2026-09-12 (details in `HANDOFF.md`, per-game numbers in `notes/ashfall/games.md`):
- Done: instrumentation (`layers`, `pace --row`); packet ablation (fields cadence, folded fields, fields on demand, compact buildings: 720 → ~430 real tokens, decision quality restored per the bench); output length (no `note`: 121 → 89 tokens; thinking off rejected); order size (label resolution on the packet's state, harvester selectors, attack-target description).
- Measurement gates added: `bin/discipline.mjs` (rule adherence of live runs), `bin/bench.mjs` + `test/games/ashfall/bench/` (fixed states with the prompt's expected order, repeats, compare, rescore), `bin/snapshot.mjs` (fixtures from runs), `bin/trajectory.mjs` (open-loop replay of a recorded game under one arm, rule rates against the recording). Run files carry prompt text, schema and raw responses from game 24 on.
- Done since (2026-09-14): order language, layer sensitivity, event tick, overlap 2, streaming dispatch, campaign runner, the game38 prompt rewrite with `--ashfall-guide`; then M8 (the scripted policy) closed the question the campaigns could not: the plan and the packet are sufficient, the model's departures are the residue. See `HANDOFF.md`.
- Was next, in order: output command language with short ids; layer-sensitivity bench; tick on event arrival; overlapping calls; streaming per-cmd dispatch; then ≥ 20 games on the final config for win rate.

Hub-side asks to file with `ashfall` once needed: `train{count}`, bank-threshold wake, event-only mode, `seq` scope.

## Risks and where they are retired

| risk | retired in |
|---|---|
| model cannot act well on a coded packet | M4 rehearsal, before any live game |
| `/ctl` protocol differs from the dev's description | M2 integration, M5 checklist (keyed branch) |
| rate limit hit by fan-out or handshake bursts | M2 single bucket + 70-frame test |
| cache never hits, or differs by model | M4 step 3 on all three models |
| trigger storm or flat-out loop in firefights | M1 batching, floor and cooldown tests |
| stale or post-game orders sent | M1 stale/ended drop tests |
| tool call truncated or unparseable | M1 stop-reason tests, M3 strict schema test |
| packet nondeterminism | M3 goldens + properties, M6 replay |
| core silently grows game assumptions | M1 boundary test + un-Ashfall mock, X5 second adapter |
| crash loses the explaining tail | M1 recorder tests |
| measurements not comparable to baseline | §1 definitions, M6 pace |

## Cut until after game 12

Per-class `pace` table and streaming dispatch (still open); `--row` shipped in M7. The second game adapter is the next plan.

## Review 2026-09-12

`docs/reviews/2026-09-12-harness.md`: 20 S1/S2 findings and the S3 list, all fixed the same day. Behaviour changes worth knowing: a due heartbeat rides the next state tick (fresh packet) and always reschedules; the core ticks `canAct:false` on non-active lifecycles; reconnect is single-flight, capped at 10 attempts, then `close` → the pilot finishes with `why:'transport'`; requests time out at 10 s; `call` lines carry `anchor` (event|tick) and a full latency split (`waitMs queueMs encodeMs apiMs expandMs validateMs sendMs = totalMs`); `pace` reports reaction over event-anchored decisions only, with `reactionSamples`, `timeouts`, `cacheWriteTokens`, and the real-token `packetP50` as the headline; `applyOrders` in `pilot.mjs` is the one order pipeline (pilot and rehearsal); the calibration divisor lives in `src/games/ashfall/calibration.json`.

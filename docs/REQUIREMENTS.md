# Quickdraw requirements

What gets built, stated so it can be tested. `PLAN.md` holds the why and the order; `IMPLEMENTATION.md` the milestones. Numbered items are requirements; a milestone is done when its items pass. Revised 2026-09-12 after the adversarial review in `reviews/`.

Quickdraw is a general harness for agents that play real-time games through a model API. A **game adapter** knows one game; the **core** knows none. Ashfall Sector is the first adapter and the test bed, nothing more. Any sentence here that only makes sense for Ashfall belongs in §9.

## 1. Goal and targets

| metric | baseline (Ashfall game 11, stock Claude Code) | target | stretch |
|---|---|---|---|
| reaction time: event arrival → last order on the wire, p50 / p90 | 8.7 s model gap; 27 s loop incl. chosen waits | ≤ 5 s / ≤ 8 s | ≤ 3 s / ≤ 5 s |
| model latency: request sent → response, p50 | ~2 s call + 6–9 s reading | ≤ 3 s | ≤ 2 s |
| decisions per game-minute | ~2.2 | ≥ 10 | |
| packet size, input tokens beyond the cached prefix (cache-hit calls only) | ~1,200 plus history | ≤ 600 | ≤ 300 |
| orders not dropped or rejected, share | not measured | ≥ 90% | |
| cache hit rate after call 2 | n/a | ≥ 90% | |
| transport rate-limit rejections | n/a | 0 | |
| win rate | game-specific baseline in `notes/` | ≥ baseline over ≥ 20 games, final config only | |
| cost per game | not measured | four usage fields logged; budget set after three runs | |

"Decision" = one model call that returned (an explicit no-op counts). Reaction time starts when the adapter emits the event, not when the trigger fires, so coalescing queue time is counted. Decision 1 of a game is excluded from medians (cold cache, schema compile). Win rate is a confirmation metric, never an iteration signal (§12).

## 2. Constraints

- **Client only.** An adapter sees what a human at the game's screen could see. No sim, no store, no second connection to spectate.
- **Fair play.** An adapter may add management: grouping, selectors, digests, triggers. Nothing that is foresight in that game. Each adapter records its game's rule in its section.
- **Core knows no game.** `src/core/` resolves no import, transitively, under `src/games/`; the core suite passes with every real adapter directory removed. Every game-specific name, event kind, unit type, cost, limit and tool name lives in the adapter. A test adapter (`src/games/mock/`) drives the whole loop in unit tests without a network and is deliberately unlike Ashfall (§10).
- **Public repo.** Keys, private hosts, account and player ids, seeds and player names in `.env` or scrubbed out, never tracked. Env is namespaced per game (`ASHFALL_*`). `runs/` gitignored. Fixtures pass the allowlist test (Q5).
- **Model.** Anthropic Messages API via `@anthropic-ai/sdk`. Model is a run parameter, never mixed inside a game. First pilots use `claude-sonnet-5` (matches the baselines); `claude-opus-5` and `claude-haiku-4-5` are experiment variables. One byte-identical prefix (system prompt + tool) serves all three (M3).

## 3. Architecture

```
src/core/     pilot.mjs     the loop: triggers → encode → assemble → model → expand → validate → send → record
              triggers.mjs  classes from the adapter, cooldowns, edge detection, coalescing, heartbeat, deadlines
              digest.mjs    diffById, rankAndCollapse: generic delta and event ranking for adapters to call
              packet.mjs    assembles adapter layers under a token budget
              model.mjs     Messages API call, tool, caching, usage, cost
              record.mjs    runs/<game>-<id>.jsonl writer
              clock.mjs     injectable {now, setTimeout, clearTimeout, setInterval}
src/lib/      helpers adapters may share (spatial clustering, token bucket); no core imports
src/games/<name>/index.mjs  exports createAdapter(env, opts) (contract in §4)
src/games/mock/             data-driven fake game for tests
bin/pilot.mjs               entry: --game <name> plus flags (§11)
bin/record.mjs              capture and scrub fixtures from a live or local game
bin/pace.mjs                measurement over run files
bin/replay.mjs              reprint the packet at a recorded decision from its refs
prompts/<game>/             system prompts, one per game played
notes/<game>/               results and lessons
test/core/  test/games/<name>/{fixtures,golden}/
```

Per decision: adapter emits `state`/`event` → core collects the tick's triggers, resolves them to at most one fire → adapter `encode` (against the previous *decision's* state) → core trims to budget → core calls the model → adapter `expand` (fan-out, clamps) → core caps → adapter `validate` against the newest state → core drops everything if the game is no longer active or the decision is too old → adapter `send` → core records with refs.

## 4. Adapter contract — `src/games/<name>/index.mjs`

The module exports `createAdapter(env, opts) → Adapter`. Two seats in one process are two adapters. The core calls nothing else.

- A1. `meta`: `{name, classes:string[], cooldownMs?:Record<class,number>, orderCap:number, actionMode:'batch'|'single', toolName:string, toolDescription:string, refreshMs?:number}`. `classes` is ordered highest urgency first and is the whole trigger vocabulary for that game; the core treats the names as opaque. `refreshMs` is the adapter's own state cadence (push interval or poll interval) so the core can align the heartbeat.
- A2. `connect()`: open the transport, authenticate. Resolves when `seat` may be called.
- A3. `seat(opts)`: create or join from the adapter's own CLI opts. Resolves `{gameId, seat}`.
- A4. `start()`, `leave()`, `concede()`: the core calls `start` once when `lifecycle === 'pregame'`, `leave` at exit, `concede` only on the explicit `--concede-on` flag.
- A5. Emits `state(snapshot)`: a **materialized** snapshot `{header, native, t}`; the adapter owns polling and diff merging. `header = {lifecycle:'pregame'|'active'|'ended', phaseNative:string, clocks?:Record<string,number>, gameId, seat}`. Emits `event({cls, key, urgency?, native, gt?})` where `cls ∈ meta.classes`, `key` names the subject so repeats collapse, `urgency` optionally overrides class rank. Emits `done({outcome:{won?, draw?, rank?}, duration?, why})`, `disconnect`, `reconnect`.
- A6. `canAct(state) → boolean` and `deadline(state) → {atMs, cls}|null`. The core never fires while `!canAct` and always fires at `deadline − margin`.
- A7. `derive(state) → [{cls, key, urgency?}]`: a pure predicate over the current state (affordability, idle production, low hp, my turn). The core edge-detects: a `(cls,key)` fires once and re-arms when it stops being reported.
- A8. `encode({state, prevDecisionState, triggers, lastOrders}) → Layer[]`, `Layer = {name, text, priority, full?, lines?:[{text, priority}]}`. Priority 0 never drops. `triggers` is every trigger since the last decision, already ranked and collapsed by the core. Delta uses `digest.diffById`; the adapter renders, it does not diff.
- A9. `tool`: a frozen literal JSON schema for the single tool `meta.toolName`, strict-compatible: a discriminated union (`$defs` + `anyOf`, `cmd:{const}` per variant, `additionalProperties:false`, all args `required`, optionals typed `[x,"null"]`) plus a required top-level `act:boolean` (or a `noop` variant) so "nothing to do" is a one-token answer. Counts and lengths are not schema-enforced (unsupported under strict); they live in `expand`/`validate`. `actionMode:'single'` means the array has one element and `orderCap` is 1.
- A9a. `decode(input) → {act, orders, note}` (optional): reads the tool input when the schema is not the A9 union, e.g. an order language in one string (`--ashfall-lang`: `t 12 tr 3; am army 12,-40`, decoded by `src/games/ashfall/lang.mjs`). The core's default reads `{act, cmds, note}`. Decoded orders are the same objects `expand` takes; an unparseable command becomes one `dropped` (`bad-cmd`), never a lost batch. The run records the input as written.
- A8a. `encode` input may carry `pending`: the trigger sets of other calls in flight (`--overlap N`), so the packet can say what is already being handled; recorded on the call row and replayed.
- A10. `expand(cmds, state, decidedOn?) → {cmds, dropped:[{cmd, reason}]}`: client-side sugar becomes wire cmds (counts fan out, clamps applied); `decidedOn` is the state the packet was encoded from, for labels pasted from it. Every trim is a `dropped` with a reason so it reaches `lastOrders`.
- A11. `validate(cmds, state) → {keep, dropped}`: legality against the newest state. May thread a provisional state through the list when legality is sequential. Pure. Game-strategy judgements (is this still a good idea?) are not validate's job; they belong to the prompt and to `lastOrders`.
- A12. `send(cmds) → Promise<CmdResult[]>` in order; resolves `{ok:false, error}` on game rejection, throws only on transport failure; while disconnected every cmd resolves `{ok:false, error:'disconnected'}`. Pacing is inside the adapter, on the transport write path, covering every frame.
- A13. Reconnect policy is the adapter's; it emits `disconnect`/`reconnect` so the core can suspend and resume (T7).
- A14. Tests: 2–3 readable golden packets reviewed in diffs, plus property tests (§10 Q2). `encode`, `expand`, `validate` are deterministic.
- A15. Adapter configuration comes from `env` and `--<game>-*` flags; the core passes the parsed bag through.

## 5. Trigger engine — `src/core/triggers.mjs`

- T1. Classes and their order come from `meta.classes`; cooldown defaults from `meta.cooldownMs`, else 0. A new `key` inside a class fires through its cooldown.
- T2. All triggers from one tick (one `state` plus the events since the previous tick, plus `derive`) are collected and resolved together to at most one fire; the whole surviving set goes to `encode`.
- T3. Heartbeat `--heartbeat` (default 3 s) is scheduled from decision **start**; if already past when a decision ends, fire immediately, never burst. Aligned to `meta.refreshMs` when set.
- T4. `canAct` false suppresses every fire except `deadline`; `deadline` schedules a forced fire at `atMs − margin` (`--deadline-margin`, default 1 s).
- T5. One call in flight per adapter. Triggers during a call set `dirty` with the highest rank seen. When the call returns, dirty re-enters through the same `offer` path (cooldowns apply) with a floor of one `refreshMs` tick between decision starts. The loop is iterative, never recursive.
- T6. Edge detection for derived triggers is here (A7).
- T7. On `disconnect` the engine suspends (outcomes recorded `suppressed:disconnected`); on `reconnect` derived-trigger memory and `prevDecisionState` are cleared and one decision is forced on the first fresh state.
- T8. Every offer outcome (`fired`, `cooldown`, `coalesced`, `suppressed:<why>`) is recorded with class, key and the event's arrival `t`.

## 6. Packet assembly — `src/core/packet.mjs`

- P1. Concatenates layers in order, trims to `--packet-max` tokens (default 600) by dropping whole layers from highest priority down; priority 0 never drops; a layer with `lines` loses lines by descending priority before the layer goes.
- P2. The local estimate divisor is calibrated per game from `messages.countTokens` over the fixtures (Q2) and asserted in tests; chars/3.5 is the placeholder until then. The recorded packet size is `usage.input_tokens` on calls where `cache_read_input_tokens > 0`; other samples are marked invalid.
- P3. Slim mode `--full-every N` exists in the CLI but is deferred until after the first live game (§12).
- P4. Records `{kept, dropped, estTokens, realTokens|null}` per decision.

## 7. Model call — `src/core/model.mjs`

- M1. Request: `system` as one text block with `cache_control:{type:'ephemeral'}`; `tools:[{name: meta.toolName, description, input_schema: adapter.tool, strict:true}]`; `tool_choice:{type:'tool', name, disable_parallel_tool_use:true}`; one user message = the packet; no history; `max_tokens` 4096.
- M2. Thinking: `thinking:{type:'adaptive'}` + `output_config:{effort:'low'}` by default; `--thinking off` sends `{type:'disabled'}` on models that accept it; Haiku 4.5 gets neither `thinking` nor `effort`. Experiment variable. `--reply text` (M7): no tool; the model answers the order line as text and `decode` reads it (`stop: text`); the forced tool call costs ~29 output tokens of framing per call whatever the thinking mode (measured 2026-09-14).
- M3. Caching: the prefix (system + tool) is padded past 4096 tokens once, at prompt-authoring time, so it caches on every candidate model with the same bytes. The four usage fields (`input`, `cache_creation_input`, `cache_read_input`, `output`) are recorded on every call; `pace` fails a run summary whose hit rate after call 2 is under 90%.
- M4. Timeout and retry: SDK `maxRetries:0`; the core owns one total deadline per decision (`--decision-deadline`, default 6 s) via `AbortController`. A failed or timed-out attempt is never resent with the same packet: if a newer trigger is dirty, skip; else re-encode once. Stop reasons are recorded distinctly: `tool_use`, `max_tokens` (→ `skipped:truncated`), `refusal` (→ `skipped:refusal`, never retried), `timeout`, `error:<class>`.
- M5. The tool input is read from `tool_use.input` as parsed JSON; `act:false` is recorded as a no-op decision with zero orders. An optional `note` is logged, never fed back.
- M6. Cost: the four usage fields priced per model from `config/prices.json` (input, cache write ×1.25, cache read ×0.1, output) and accumulated per run. `--max-usd` and `--max-decisions` stop deciding and record `budget-stop`; the game is left running. Concede is only ever `--concede-on budget|never` (default never).
- M7. The schema is a frozen literal; its sha256 and the prompt's are in the run's config line. A schema byte change is a deliberate act (strict schemas compile server-side; the first call after a change is slower).
- M8. Streaming with per-cmd dispatch as each cmd's JSON closes (`eager_input_streaming`) is an experiment (§12), not the baseline.
- M9. Scripted policy (2026-09-14): `--model script:<name>` loads `src/games/<game>/policy/<name>.mjs` (`decide(packetText) → {o, why}`) behind the same `callModel` seam (`scriptModel`); `o` is decoded by the game's order language, `why` rides in `note`, usage and cost are zero, a packet the script cannot read is `stop:'error:read'`. The policy reads the packet **text** only (`src/games/ashfall/read.mjs`), never the state, so it is the packet-sufficiency test: what the script can play from, the packet carries. Every tool that takes `callModel` (pilot, bench, trajectory, sensitivity, rehearse) accepts it.

## 8. Recording, replay, measurement

- R1. `runs/<game>-<id>.jsonl`. `state` lines carry a monotonic `idx`; policy `--record-state all|on-decision|sampled` (default `all`). `trigger`, `call`, `decision`, `result`, `done`, `budget-stop` lines are written immediately; `state` goes through an async stream with backpressure. SIGINT, SIGTERM, `uncaughtException` and `unhandledRejection` flush and exit. Every line has wall `t`; `gt` where the game has a clock. Line one is the resolved config, the prompt sha and the schema sha.
- R2. The `call` line carries `{stateRef, prevDecisionRef, triggerRefs, lastOrders, packet, usage, stop, latency:{encodeMs, apiMs, expandMs, validateMs, sendMs, totalMs}, eventArrivalT}`.
- R3. `bin/replay.mjs <run> <n>` re-runs `encode` + assemble from the refs with the run's config and diffs against the recorded packet; byte-equal is the determinism check.
- R4. `bin/pace.mjs <run…>`: first cut prints decisions, reaction time p50/p90 (event arrival → last result), model latency p50, decisions per game-minute, packet tokens (valid samples), cache hit rate, orders kept/dropped/rejected, rate-limit hits, reconnects, stop-reason counts, outcome, duration, cost. `--row [game]` prints the `notes/<game>/games.md` row. `bin/layers.mjs <run…>` replays packets and prints per-layer tokens, packet share, constant share and repeat share (M7 step 1). `bin/discipline.mjs <run…>` scores rule adherence from run files. `bin/bench.mjs` scores a harness configuration on fixed states against the prompt's own rules (`test/games/<game>/bench/cases.mjs`, fixtures scrubbed by `bin/snapshot.mjs`), repeats × cases, ~$0.006 a call; `--compare` prints arms side by side. Every packet, schema or expand change is benched before a live game. `bin/trajectory.mjs <run> [--every k] [arm flags]` replays a recorded game open-loop: the recording's states, triggers, last orders and decision indices are the fixed environment, one harness arm re-decides each recorded decision, and the orders are scored against the recording (`--compare` across arms). Run files carry the prompt text, schema and raw model response so a recording replays without the repo. Per-class trigger stats come later in M7. `pace` uses wall `t` only.

## 9. Ashfall Sector adapter — `src/games/ashfall/`

Run commands, flags, packet, orders, scripted policy and scoreboard: `notes/ashfall/README.md`.

Protocol facts from the Ashfall dev (ask-dev, 2026-09-12; source `README.md` §Protocol, `docs/ARCHITECTURE.md` §Hub, `server/hub.mjs`, `shared/sim.mjs`). Re-ask before relying on anything not listed. Open with the dev: is event `seq` per game or per socket.

**Fair play (Ashfall's rule).** `ctlView` is fog-limited and is the whole channel. Management QoL is allowed; foresight is not. Hub-side asks go through ask-dev to `ashfall`.

**Transport.** `wss://<host>/ctl`, header `Authorization: Bearer ash_…` on upgrade; first message in is `hello{player}`. Seat with `create{id,team?,size?,opponent?,name?}` or `join{id,game,team}` → `result{ok,result:{game,team,seed}}`. One socket, one seat. Server sends only `hello`, `state{state}` (full snapshot every 500 ms, no diffs), `event{ev:{seq,t,kind,…}}`, `result{id,ok,result|error}`. Client sends `{type,id?,…}`: `games ranks register create join leave`, seated `cmd{cmd,args} say start concede state`. **One cmd per message, no batch**; applied in arrival order, synchronously, so a sequence lands atomically between ticks. Ids are numbers on the wire.

**Auth seam.** One `auth(opts)` with two branches: keyed (live: Bearer header, `hello` carries `player`) and open (local hub: no header, `register{name}`, `player` in create/join). Both branches have tests (Q3, Q4).

**Limits.** 20 msg/s per account, burst 60; 64 KB frame; `create` burst 2 then 1/10 s; 32 sockets and 1 upgrade/s per IP; ping 30 s, no pong 30 s = terminated; reader > 1 MB behind = terminated; 2 unfinished games per account; game with no sockets 60 s = removed. One token bucket on the socket write path covers every frame, including the reconnect handshake. `result{error:'rate limited: slow down'}` is an adapter bug.

**Reconnect.** Drop = leave. New socket + `join{game,team}`; after `started` the seat is held by account. Backoff 0.5, 1, 2, 5 s. Emits `disconnect`/`reconnect` (T7). On startup list `games` and `leave` any unfinished seat that is not the target.

**State.** `{game,team,name,size,time,ore,crystal,supply,upgrades,started,queued,gameOver,winner,eliminationIn,enemyEliminationIn,myBase,mine[],enemyVisible[],enemyBuildingsRemembered[],fields[]}`; entity `{id,type,x,z,team,elev,hp,max}`, buildings add `queue[],prog,rally`, units add `state,entrenched?,target?,goal?,attackMove?,carry?,carryKind?`, remembered add `progress,lastSeen`, fields `{x,z,kind,res,live,seen,ore,nodes[{id,amount,seen}]}`. Header: `lifecycle` from `started/queued/gameOver`, `phaseNative` one of `notStarted|queued|running|over`, `clocks:{game:time}`, `seat` = team. `refreshMs` 500.

**Classes** (`meta.classes`, highest first): `danger contact loss idle done economy info`; cooldowns `danger` 2000, `contact` 1000. Events: `attacked`→`danger` (key = target id; buildings rank above units via `urgency`); `sighted`→`contact` (key = 20-unit grid cell); `died` own→`loss`, enemy→`info`; `idle`→`idle` (key = unit id, carries `why`); `built placed trained cancelled research`→`done`; `bust`→`economy`; `started gameover queued chat`→`info`. `derive` predicates: finished barracks/core with empty queue → `idle`; ore ≥ a purchase line (worker 50, trooper 60, depot 75, turret 110, barracks 120; crystal 40) → `economy`; supply within 2 of cap → `economy`; own building under 60% → `danger`. `canAct` is `lifecycle === 'active'`; `deadline` is null.

**Event buffer.** Repeats collapse by `(kind,key)` at insert; per-class capacity so `done`/`idle` survive an `attacked` flood; `seq` gaps counted and logged.

**Encode layers**, priority in brackets: header [0] clock, ore, crystal, supply/cap + `CAPPED`, upgrades, elimination countdowns, phase; delta [0] from `digest.diffById` over `mine`, `enemyVisible`, queues and fields since the previous decision, `Δ none` when empty; triggers [1] the core's ranked set, top 6, rendered; production [0] per building queue length, head item and seconds left, rally, `IDLE`; economy [1] harvesters per field with field ore, idle harvesters, crystal miners; army [2] clustered by type and proximity r=8 via `lib/cluster` (count, centroid, state); buildings [2] hp/max, construction %; enemy visible [1] clustered, distance to my nearest building and army; remembered [3, `full`] position, last hp, age; fields [3, `full`] kind, position, ore, explored?; last orders [0] previous cmds with `ok`/error/`dropped:<reason>`. Fixed order, abbreviations from one `ABBR` table that also feeds the tool description, integers only.

**Tool.** `meta.toolName` `orders`, `actionMode` `batch`, `orderCap` 15. Variants mirror the wire cmds `move attack stop disband gather repair build train research cancel rally` with their args (`units` = numeric ids or selectors `all army idle workers troopers raiders wardens siege`, `near{x,z,r}`); `train` gains `count`. Required `act:boolean`.

**Expand.** `train count` fans out, clamped to `5 − queue.length`, each trim a `dropped:queue-full`; `type#id` strings become numbers, anything else `dropped:bad-id`. Core caps at 15 after expand (`dropped:cap`). A same-cmd-same-args repeat within a decision, or identical to an order sent in the last 2 decisions that is still pending, is `dropped:repeat`.

**Validate.** Drop `attack` whose target is not in `enemyVisible`; cmds whose unit ids are all dead; `train` when `CAPPED` or ore < cost; `build` when ore < cost (cost table local). The server stays the authority for everything else.

**Lifecycle.** `register` only when `hello` has no player; `start` if `notStarted`; wait through `queued`; `gameover` event or `state.gameOver` → `done{outcome:{won}, duration:minutes, why}`; `leave`; exit 0/1.

**Local hub.** From the game repo: `ASHFALL_OPEN=1 node server/hub.mjs` (port 8765). Integration tests run only when `ASHFALL_LOCAL` points at the repo.

**Fixtures.** Captured with `bin/record.mjs --game ashfall` against local or live, scrubbed by allowlist: only fields `coder`/`validate`/`expand` read, entity and game ids renumbered from 1, `name`/`seed`/`player` dropped. Committed under `test/games/ashfall/fixtures/`.

**Env.** `ASHFALL_KEY`, `ASHFALL_HOST` (default the public play host).

**Hub-side asks to file with `ashfall`.** `train{count}` on the wire; a bank-threshold wake event; an event-only mode with state on request; `seq` scope.

## 9b. MicroRTS adapter — `src/games/microrts/`

Run commands, flags, packet, orders, scripted policy and scoreboard: `notes/microrts/README.md`.

Protocol facts verified against the clone's source and the running engine, 2026-09-14/15 (`src/ai/socket/SocketAI.java`,
`src/rts/{RemoteGame,Game,GameState,PlayerAction,UnitAction,PhysicalGameState}.java`, `src/rts/units/UnitTypeTable.java`).
Game two, and the proof of X5.

**Fair play (MicroRTS's rule).** `basesWorkers16x16` has no fog, so the whole board is what a human at the screen sees;
the adapter reads the state the engine hands it and nothing else. It never touches the engine's objects, only the socket.

**Engine patch (required).** `src/games/microrts/remote-game-utt.patch`. In stock `launch_mode=CLIENT`, `RemoteGame.run()`
builds one `UnitTypeTable` for the AIs and `Game(GameSettings, AI, AI)` a second for the board. `UnitAction.equals`
compares a `TYPE_PRODUCE`'s `unitType` by object identity and `PlayerAction.fromJSON` resolves ours against the AI table,
so `GameState.issueSafe` downgrades every produce — ours and any `ai.abstraction.*Rush`'s — to a `TYPE_NONE` of the same
duration. Measured: the base idle for exactly `produceTime` after each produce; WorkerRush and `ai.coac.CoacAI` frozen at
two units over 1500 cycles while `ai.RandomBiasedAI`, which reads the live state, reached 23. The patch hands `Game` the
AIs' own table. `MICRORTS_LOCAL` must point at a clone with it applied.

**Transport.** The engine dials OUT to a TCP server the adapter opens; newline-delimited JSON, `serialization_type=2`.
`budget T I` → `ack`; `utt` + the type table → `ack` (sent twice, on reset and at start); `preGameAnalysis ms` + state →
`ack`; `getAction <player>` + the full state → one PlayerAction line; `gameOver <winner>` → `ack`, winner `-1` = draw.
`SocketAI` sets no socket timeout, so **the reply delay is the game's clock**: the adapter holds each answer until
`--microrts-cycle-ms` (default 100) has passed since the last, and 3000 cycles is five minutes of real time. `connect()`
listens and spawns the java child from a temp properties file (`--microrts-spawn false` waits for an external one);
classpath `lib/*:lib/bots/*:bin` — `lib/*` alone misses the tournament bots. `seat()` resolves `{gameId, seat: 0}` once
the socket and the type table have arrived; AI1 is always the socket AI in CLIENT mode, AI2 is `--microrts-opponent`.

**State.** Materialized every `refreshMs` (500) from the last `getAction`: `{cycle, width, height, terrain, me, res[],
tt, units[]}`, unit `{id, type, player, x, y, hp, carry, busy, st, eta, idleFor, make?, dest?}`. `tt` is the slice of the
engine's type table the packet and the rules read, carried on every snapshot so `encode`/`expand`/`validate` stay pure
over a recorded state and `bin/replay.mjs` needs no engine. **`busy` excludes `TYPE_NONE`**: `PlayerAction.fillWithNones`
hands every unmentioned unit a 10-cycle idle and `GameState.issue` overwrites one freely, so reading those as busy hid
every producer nine cycles in ten. `dest` is the cell an in-flight move or produce will take; the engine cancels a second
unit heading for the same cell, so the buffer routes around them. Header `{lifecycle, phaseNative, clocks:{cycle}}`;
`canAct` is `lifecycle === 'active'`; `deadline` is null.

**Classes** (`meta.classes`, highest first): `danger contact loss idle done economy info`; cooldowns `danger` 2000,
`contact` 1000, `idle` 1000. Cycle-to-cycle diffs (`digest.diffById`) give `loss` (my unit gone), `done` (my unit new),
`danger` (my hp dropped, buildings above units by urgency), `info` (their unit died, started, gameover). `derive`
predicates: an enemy within 6 of anything of mine → `contact` keyed on a 4×4 grid cell; my mobile unit idle ≥ 10 cycles →
`idle`; a building that can produce and is free, or the bank crossing a purchase line → `economy`; a building under 60% →
`danger`.

**Encode layers**, priority in brackets: H [0] cycle, bank, my mobile units / theirs; D [0] diff since the previous
decision; T [1] the core's ranked triggers, top 6; P [0] each of my buildings, what it is making and cycles left, or
`IDLE`; E [1] resource nodes with what is left and the steps from my base; A [2] my mobile units clustered r=2 via
`lib/cluster`, with **every id** (on a 16×16 board they cost a few characters and are the only way an order names one
unit); B [2] my buildings; X [1] their units clustered, with steps to my base and to my nearest unit; L [0] my last
orders with results. Each layer has one `*Facts` function and one renderer that prints those facts, so `read.mjs` and
`facts.mjs` cannot drift. Fixed order, integers only, vocabulary from `abbr.mjs`. ~120 est tokens on 16×16.

**Standing orders.** The engine takes one single-step action per unit per cycle; a decision arrives every 500 ms. So an
order is a **goal** parked in `orders.mjs`, keyed by the unit it commands, and every cycle `step()` issues the next step
toward it: BFS one cell, harvest or return when adjacent, attack what is in range. A new order for a unit replaces its
goal, so repeating a standing order is free. An attack at a cell **holds** that cell rather than completing, and stops one
step short when the cell is occupied (their base is a unit). A goal leaves the buffer when it completes, when its unit
dies, or after `dropAfter` (20) cycles it could not be stepped. `send()` resolves on the first `step()` after the push —
`ok` if a step went out or the subject is busy, `wait` if the goal stands but could not step, `dead`/`stuck` otherwise —
so it is bounded by one cycle rather than the life of the goal.

**Tool.** `meta.toolName` `orders`, `actionMode` `batch`, `orderCap` 10, one string (`tool.mjs`), decoded by `lang.mjs`:
`t <id> <unit> [n]` produce (the id may be a Worker: a Worker produces Base and Barracks), `h <units> [nodeId]` harvest,
`m <units> <x>,<y>` move, `a <units> <x>,<y>|<unitId>` attack-move or hunt, `-` nothing. There is no JSON mode and no
`--microrts-lang` flag. `<units>` is ids, a selector (`all idle wk li hv rg`) or a cluster label pasted from A.

**Expand.** Selectors and labels become ids (labels resolve against `decidedOn` first); ids are coerced; duplicates
collapse; `train count` does **not** fan out, because MicroRTS has no queue — the count stays on the goal and the buffer
produces one at a time, which is what keeps a producer busy between decisions.

**Validate.** Mirrors `Unit.getUnitActions` + `issueSafe`, which silently replaces an illegal action with an idle of the
same duration, so a bad order costs the unit its whole action. Drops: a producer that is not mine or cannot make the type;
**a producer with an in-flight produce** (issuing over it cancels it and burns the resources — a producer merely walking
keeps the order, the buffer holds it); an unaffordable produce, threading the bank through the list; a producer boxed in
on all four sides; orders whose units are all dead or cannot do the job; a move or attack-move at a wall or off the map;
an attack whose target is not a live enemy. Mobile units are never dropped for being busy: they are busy 8–20 cycles in
every 10 and the buffer exists to wait for them.

**Phase B.** `read.mjs` (packet text → facts, strict on H P E A B X, classifying on D T L, `ReadError` otherwise),
`facts.mjs` (the full state view in those same facts, sharing coder's `*Facts`), `policy/rush.mjs` (`decide(text)` and
`decideFacts(k)`), `test/games/microrts/bench/{cases,rules}.mjs`. `bin/oracle.mjs`, `bin/bench.mjs` and
`bin/trajectory.mjs` all run with `--game microrts` and no change of their own.

**Env.** `MICRORTS_LOCAL` (or `--microrts-local`), plus `--microrts-map --microrts-opponent --microrts-cycle-ms
--microrts-max-cycles --microrts-port --microrts-spawn --microrts-order-cap`. The estimate divisor is the 3.5 placeholder:
calibrating it needs `messages.countTokens` and a key (P2).

## 10. Tests

- Q1. Core unit, no network, virtual time (`clock.mjs` injected everywhere a timer exists): trigger batching, cooldown and key-break, heartbeat from start, canAct/deadline, dirty re-entry with floor, suspend/resume on disconnect, edge detection; packet trimming; expand/cap/validate ordering; model request shape per model, stop-reason handling, deadline and no-stale-resend; recorder immediate vs buffered lines and signal flush; full loop against the mock adapter with a stub `callModel` passed through the injection point.
- Q2. Adapter tests: 2–3 readable goldens (opening, firefight, late) whose diff is reviewed; property tests: layer order and priorities, integers only, vocabulary ⊆ `ABBR`, no id leakage, each visible enemy rendered once, the busiest fixture under `--packet-max`; `countTokens` calibration of the estimate divisor.
- Q3. Adapter integration against the game's local server, skipped unless its env flag is set; covers the open-auth branch, cmd round trip, forced terminate and rejoin.
- Q4. Live checklist before the first game of any new adapter version: keyed upgrade, forced terminate, rejoin by account, one order round trip.
- Q5. Repo hygiene: every fixture passes the allowlist and matches none of `ash_`, `@`, 16-hex; `src/core/` transitive import graph resolves nothing under `src/games/`; the core suite passes with `src/games/ashfall/` removed.
- Q6. Mock adapter is data: a `timeline` of `[tMs, kind, payload]` and a `faults` list (`disconnect`, `rejectCmd`, `doneMidCall`, `deadline`), injected clock, `send` records orders rather than driving the world. It is turn-based, deadline-driven, single-action, draw-capable and clockless so §4's generality members are exercised in M1.

## 11. Configuration

`bin/pilot.mjs --game <name>` plus `--model --prompt --heartbeat --deadline-margin --decision-deadline --packet-max --full-every --thinking --effort --reply --overlap --reserve --event-tick --stream --max-usd --max-decisions --concede-on --record-state --run-dir --stop-file`, then `--<game>-*` flags (M7: `--overlap N` calls in flight, `--reserve cls,cls` keeps the last slot for those classes, `--event-tick` decides on event arrival, `--stream` sends each command as its text closes, `--reply text` answers without a tool). Grammar: `--k v`, `--k=v`; boolean flags are an explicit list; everything else takes a value. Env is loaded in JS from `.env` when present (Node 20 has no `--env-file-if-exists`). `--stop-file <path>`: when the file appears the pilot flushes, leaves and exits. Line one of every run records the resolved config.

## 12. Experiment protocol

- X1. Iterate on within-game proxies with many samples per game: reaction time p50/p90, model latency, orders kept/dropped/rejected, no-op share, idle-production seconds, bank integral, cost. Win rate is confirmed once, on the final configuration, over ≥ 20 games.
- X2. One variable per game, in this order: output length (thinking off vs low effort, order cap, drop `note`), then decision deadline, then heartbeat, then packet budget 600 → 400 → 300, then `--full-every`, then model, then prompt. Streaming per-cmd dispatch after that.
- X3. Prompts are `prompts/<game>/gameNN-<model>.md`; the run records the prompt and schema shas; changing either between compared games is itself a variable.
- X4. Stop shrinking the packet when orders-kept share or no-op share moves over three games; keep the last size that held.
- X5. A second game is the proof of generality: added with zero changes under `src/core/`. **Met 2026-09-15**: the
  MicroRTS adapter (§9b) is 13 files under `src/games/microrts/` with `git diff src/core` empty. Three `bin/` tools turned
  out Ashfall-only and were not changed: `bin/record.mjs` (hard `if (game !== 'ashfall')` plus direct `ashfall/ctl|auth|
  scrub|opening` imports — fixtures were written from run rows instead), `bin/snapshot.mjs` (imports `ashfall/scrub.mjs`)
  and `bin/discipline.mjs` (scores Ashfall's prompt rules). `bin/campaign.mjs` is game-generic but counted a draw as an
  undecided game and stopped the campaign (MicroRTS ends at `max_cycles` in a draw); fixed 2026-09-15, `finished` now
  takes `outcome.draw` too. The five games had run from a plain loop. `bin/bench.mjs` asks every game's `events.mjs` for
  `toTrigger`, which MicroRTS therefore exports.
- X6. Three-way split (2026-09-14): a live loss is attributed, never guessed. The scripted policy (M9) is the reference: it passes the bench (packet sufficiency), plays live at $0 (the strategy's win rate at the harness floor), and `trajectory --model script:<name> --diff` scores the model's decisions against it per line (`buyAgreeW`/`armyAgreeW`, windowed because the script re-issues standing orders every packet). Model departures become bench cases (snapshot the state); a harness change is gated on the bench against the script's line, then one live game; the campaign runner (`bin/campaign.mjs`) gives win rates per arm with a Wilson interval, the script arm free.
- X7. Fidelity is the harness's own number, agent-independent and free: the scripted policy decides twice on every recorded decision, once from the packet the model saw (`read`) and once from the full state (`src/games/<game>/facts.mjs`), and `bin/oracle.mjs` reports the decision-equivalence rate, the per-layer facts differences and the layer each disagreement came from. A packet change that costs fidelity is paying for its tokens with decisions.
  - v2 (2026-09-15): the state side is unbudgeted **and unshaped** — every mobile unit is its own A entry with its own state and position, every building carries its position, Ashfall's F is unfolded. The guide/planMarks marks stay, gated by the same gameOpts: they are state-derived facts, not budget. So the per-layer column is the *compression* loss (what the encoder folded away) and the decision column is what that, the budget and the cadence together cost. v1 mirrored the encoder's shaping and could only see the last two: it scored Ashfall 100% over 5,958 decisions and MicroRTS 100% over 716, where v2 reads 93% and 36%.
  - Equivalence is decisions, not text: both order strings are decoded by the game's `lang.mjs` and expanded by its `expand.mjs` against the recorded state, and the sets of effective commands are compared with the id lists sorted (Ashfall's `expand` takes its defaults, so no sticky command is suppressed). A cluster label and the per-unit labels that resolve to the same units are the same order; `exact` stays text equality.
  - The invariant is testable: `encode(input, {...opts, full: true})` renders exactly that full view (`--<game>-full true` from the CLI), and `test/games/<game>/facts.test.mjs` asserts the two readers agree layer for layer on it. Everything new is gated on `full`, so every shipping config renders byte for byte as before.
  - v3 (2026-09-15), two parts:
    - **`--arm`**: after the bare `--arm` flag every `--<game>-*` flag is a gameOpt, and the packet side stops being the recorded text — it is re-encoded from the recorded inputs under the recording's gameOpts overlaid with those flags (the same adapter and the same `assemble` arguments `bin/replay.mjs` uses, `n` included), while the state side reads the same overlaid opts. So one encoder option can be ablated and its own share of the lost decisions read off the TOTAL line, instead of the co-attribution the per-layer column gives (a layer that differs on a lost decision did not necessarily cause it). The sanity gate is that `--arm` with no overrides reproduces the recorded packet byte for byte and therefore the non-arm summary exactly; `test/games/{ashfall,microrts}/facts.test.mjs` assert it. So that an unshaped B is still readable, the guide/planMarks marks now ride every B shape, not only the compact line (`coder.buildings`); with the guide off the bytes are unchanged.
    - **X unfolded**: X renders per enemy entity on the state side, the way A does — `cluster` at `FULL_R` never merges, so every enemy keeps its own cell, its own `dug` flag, its own id and its own dB/dA — and `encode(..., {full: true})` renders X the same way, so the invariant holds. Ashfall 93% → 92% (477 lost, 5,958 decisions), MicroRTS 36% → 34% (716). The cost is small and classified: of Ashfall's 67 newly-lost decisions 39 are a target coordinate moving from the cluster centroid to one unit's cell, 20 are Army 1's `their dug cluster outnumbers my riflemen here` test, which reads a cluster's `n` and is inexpressible against a per-unit view, and 8 are rules firing on a per-unit distance the centroid hid; of MicroRTS's 18, 6 are the one-cell move and 12 are the defend rule reading a raider the cluster had folded into a farther centroid.

## 13. Non-goals (this round)

- No UI; the game's own client is the viewer.
- No multi-seat or self-play until one pilot beats a game's scripted opponent reliably.
- No game-side changes here; those are requests to the game's dev.
- No history or cross-game memory beyond the prompt.

## 14. Open

- Event `seq` scope across rejoin (ask `ashfall`).
- Streaming per-cmd dispatch: how validate runs on a partial order list.
- ~~Whether slim packets (P3) hold decision quality~~: yes (bench 92% on the working config, every layer read; HANDOFF).
- ~~Second game candidate, so the adapter contract gets a real test early~~: MicroRTS (§9b), added 2026-09-15 with `git diff src/core` empty — X5 met.
- How far the packet may carry the plan's compound conditions (`--ashfall-guide`, `--ashfall-plan-marks`) before the model is copying a verdict rather than deciding; the script shows the plan needs no model at all, so the model's value is only in departures that win more than the plan.

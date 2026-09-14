# Handoff — 2026-09-14

State of Quickdraw after M0–M6 and M7 through game 30 (2026-09-14: output-floor and layer-sensitivity studies offline, game 29 = `--overlap 3` live, game 30 = `--stream` live, won). `npm test` is 120 tests, 3 skipped (need `ASHFALL_LOCAL`, `ASHFALL_LIVE=1`, or a key), under a second on virtual time. Chronology and per-game numbers are in `notes/ashfall/games.md`; this file is where things stand and what to do next.

Today in one line: reaction p50 5.6 s (game 24, JSON tool, one call at a time) → 2.3 s (game 28: order language, remembered layer fixed, two calls in flight, event tick), output 101 → 38 tokens, and the last two games were wins. Every step was gated offline first (bench, trajectory replay) and confirmed by one live game.

## Direction

Harness, not strategy. The strategy sections (`## Play` onward) of `prompts/ashfall/game15-sonnet.md` are frozen and byte-identical in every prompt variant (`lang.test.mjs` enforces it for `game25-sonnet.md`, the current prompt); the format section (packet layers, tool, order language) is harness territory and may change once the bench shows decisions do not move. Iterate on seconds per decision and tokens per packet. **Win rate is a confirmation metric only; the bench and trajectory replay are the gates** (see Measurement).

## Working config

```
node bin/pilot.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game25-sonnet.md --packet-max 1000 \
  --full-every 5 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true \
  --ashfall-keep-remembered true --ashfall-lang true --overlap 2 --event-tick --stream \
  --max-usd 2 --concede-on budget --stop-file /tmp/qd-stop --ashfall-concede-stale true
```

What each flag does, and why it is on (all off by default so old runs replay byte for byte):
- `--full-every 5`: fields and remembered layers on one packet in five. Packet 720 → ~430 real tokens (games 17–19).
- `--ashfall-fold-fields`: unexplored fields collapse into one `f? f3@x,z …` line, positions kept.
- `--ashfall-fields-on-demand`: fields stay on every packet while a harvester is idle or a worked field is dry; the gather order needs a node id (game 19: 24 blind gathers → 0 in game 20).
- `--ashfall-no-note`: schema without `note`; output 121 → 89 tokens (game 23).
- `--ashfall-compact-buildings`: one always-on `B` line, ids and types, positions for core and turrets, hp/bld only when hurt or unfinished. The prompt's whole build logic reads `B`; with it on the bench the slim packet matches the full packet (76%) at 39% of the tokens.
- `--ashfall-lang` with the game25 prompt: the model returns one string (`t 12 tr 3; am army 65,25`) decoded by `src/games/ashfall/lang.mjs` into the same order objects; bench 98% (JSON tool 76%), output 88 → 46 tokens, game 25 reaction p50 3.7 s against 5.6 s. The parser accepts what the model actually writes (arguments glued on with commas, a label inside a list, `tr` as a selector) and strips the tool-call closing tag it leaks on ~2% of calls; anything else is one `bad-cmd` drop.
- `--ashfall-keep-remembered`: the M layer on every packet at army priority. Without it the one-line M tied with fields and was budget-dropped first: in game 25 the enemy base position reached the model on 1 packet of 118 and the ball went to the prompt's example coordinates 14 times. Replay with the flag: pushes go to the remembered barracks, `pushTarget` 22/25 against 1/14.
- `--packet-max 1000`: the 600 default was an M1 guess. Game 25 hit it on 44 calls; replay at 1000 showed no latency or rule change, so it is a rail, not a shaping tool. Packet content is decided by cadence and priority, gated by the bench.
- `--overlap 2`: a ranked trigger may start a second call while one is in flight (heartbeats never do); each returns against the newest state; the later packet's `L` line lists the pending call's triggers; decision numbers are assigned at start. Game 27: reaction p50 3.7 → 2.5 s, wait 1.2 → 0.3 s, 45 decisions a minute, $1.14 for 8 minutes (about 1.4× the cost a minute). Game 26 was the defect run (see below).
- `--overlap 3` (game 29, loss, budget-stopped at 17:54): reaction p50 2.2 s / p90 3.1 s against 2.3 / 3.3, event calls behind calls in flight 15% against 31%, $0.11 a minute. Inside one game's noise on reaction; keep 2 in the working config until a second game says otherwise, 3 is not worse.
- `--stream` (game 30, win 6:42, $0.91): first order p50 2.2 s against 2.4 s to the last order; on the third of decisions that send more than one command the first goes out 0.6 s (p50) before the last, single-command decisions gain nothing (the closing quote arrives with the final message). Same tokens, same cost a minute; on. Mechanism: `eager_input_streaming` on the tool; `extractO` reads the `o` string out of the partial JSON and each command is handed on as its `;` closes; the pilot expands, validates and sends it at once (`prior` feeds the cap and the repeat check, the adapter merges a streamed decision's sticky signatures into one `recent` entry via `send(cmds, {partial})`). A call that dies after orders went out is recorded as a decision (`partial: true`), not retried. Probe: with eager streaming the first command closes 0.3–0.7 s before the final message on multi-command answers; without it every command is in the last delta. `pace` reports `first order p50` from `latency.firstSendMs`.
- `--event-tick`: the adapter hands each event on as the hub delivers it and the core ticks at once on the latest state (derived triggers recomputed so edge detection holds), instead of waiting for the next 500 ms push. Game 28: event wait p50 0.49 → 0.18 s, reaction p50 2.5 → 2.3 s, won.
- Superseded, kept for replay of games 17–23: `--ashfall-full-buildings`, `--ashfall-keep-anchor`. Untested: `--ashfall-order-cap N`. Worse: `--thinking off` (game 22 JSON tool: slower and longer output; 2026-09-14 bench under the language: no gain), `--reply text` with `game29-sonnet.md` (no tool, the model narrates: bench 67% at 85 output tokens).

Expand sugar in the same config (no flag): pasted cluster labels resolve against the state the packet was encoded from (60 of 60 stale-label drops fixed); `idle` in `gather`/`repair`/`build` means idle harvesters, else the harvester nearest the job; `"all army"` splits into selectors; `attack` on a remembered building becomes an attack-move at its position; the tool describes attack's target as "visible in X now".

## Where the seconds are (game 28, reaction p50 2.3 s / p90 3.3 s; game 24 was 5.6 s with the JSON tool and no overlap)

| stage | time | lever |
|---|---|---|
| event waits for calls in flight (game 28, two slots: 50 of 162 event calls, p50 ~1.2 s; game 29, three slots: 51 of 331, p50 0.94 s) | ~0.2 s | `--overlap 3` halved the share that waits, reaction p50 2.3 → 2.2 s (one game, inside noise); done |
| prefill (~9k cached + ~500–650 fresh tokens) | ~0.5 s | little left in the packet |
| output, 38–43 tokens with the order language (was 90–120) | ~0.8 s | 29 of them are the forced tool call's framing, the same under any thinking mode; not cuttable (see Output floor). `--stream` sends each command as it closes: the first of several goes out ~0.6 s early (game 30) |
| expand, validate, send | ~0.05 s | done |

Real minus estimated packet tokens is a steady ~150 tokens of message framing, not cuttable.

## Measurement (all offline unless stated)

| tool | question it answers | cost |
|---|---|---|
| `bin/pace.mjs <run…>` (`--row N` prints the games.md row) | pace, latency split, tokens, cache, orders kept, cost | free |
| `bin/replay.mjs <run> all` | encode is pure over the recorded refs (byte-for-byte) | free |
| `bin/layers.mjs <run…>` | per-layer tokens, share, constant and repeat lines | free |
| `bin/discipline.mjs <run…>` | rule adherence of a live game: turret time, first push size/turret-up, pushes, bank, idle harvesters | free |
| `bin/bench.mjs [arm flags] --repeats 5 --out a.json`; `--compare`; `--rescore` | decision quality of a harness config on eleven fixed states with the prompt's expected order (`test/games/ashfall/bench/cases.mjs`) | ~$0.20 an arm |
| `bin/sensitivity.mjs [arm flags] --repeats 5 --out dir [--layers a,b] [--control c.json]` | which packet layers the decisions read: the bench with one layer removed, per layer, against a control; case × layer calls skipped where the control packet would not carry the layer (`X none`, slim cadence) | ~$1.30 at 5 repeats, 84 calls a repeat |
| `bin/snapshot.mjs <run> (--row R \| --n N) --out fixture.json` | a scrubbed, committable fixture from any recorded state | free |
| `bin/trajectory.mjs <run> [--every k] [arm flags] --out a.json`; `--compare`; `--rescore` | open-loop replay of a recorded game under one arm: same states, triggers, last orders, decision numbers; scored on rates and on ten per-decision rules (`test/games/ashfall/bench/rules.mjs`), recording as the reference column | ~$0.006 a decision |
| `bin/rehearse.mjs [--slim] [arm flags] --pick …` | the older fixed-state A/B (threads last orders across picks) | ~$0.02 a call |

Timing levers (overlap, event tick) cannot be measured offline: the replay tools re-decide recorded states, they do not re-time them. Those are gated by one live game and read with `pace` and the wait split (`latency.waitMs` on event-anchored calls: under 600 ms is the push wait, over it is time behind a call in flight).

Run files from game 24 on are complete captures: `system` (prompt text), `tool` (schema) and `meta` in the config line; every state; per call the packet, triggers, refs, `raw` model response, usage, latency split; per decision the raw orders, sent, dropped; every server result.

Facts the tools established:
- **Noise floor**: the recorded config replayed on itself agrees with the recording on command kinds 54% of the time (game 24, 84 decisions). Compare arms on rates only; under ~15 points at 84 decisions is noise; bench cases need ≥ 5 repeats.
- **Bench** (11 cases since game 25): full packet 76%; slim without `B` 58%; slim + expand sugar 69%; slim + compact `B` 76% at 174 est / 88 output tokens; + order language 98% (the nine older cases) at 46 output tokens. The two game-25 cases: `nobarracks` 5/5, `remembered` 3/5 (the misses send an unhurt ball home). A case is added when a live game shows a decision the bench could not fail on; never tuned to pass.
- **Rule adherence live** (`discipline`): game 15 (full) turret 1:34, pushed at 2:22 with the turret up; games 16–23 (slim, no `B`) pushed at 2:10–3:00 with no turret; game 24 (compact `B`) turret 2:41, push at 3:25 with the turret up; game 28 (working config) turret 2:23, push at 3:08 with 9 and the turret up, 15 pushes at the mirror. First pushes were never pieces; losses come from the ball dying with no follow-up.
- **Layer sensitivity (2026-09-14, `bin/sensitivity.mjs`, working config, 5 repeats, 420 calls, $1.18)**: every layer is read; removing any one costs more than the ±1-case day-to-day drift. Control 93% (remembered 1/5, all else 5/5). Δ pass over the cases that carried the layer, and the est tokens it costs: buildings −33 (29 tok; turret 5→1, push 5→1, repair 5→0), army −18 (46; push 5→0, turret 5→2), header −17 (17; capped 5→0, train 5→1), economy −17 (27; core 5→1, train 5→2), triggers −11 (4; train 5→0), production −8 (28; train 5→0), enemy −33 on its 3 cases (17; core 5→0), remembered −20 on its 2 cases (78; remembered 1→0), fields −40 on its 2 on-demand cases (296; dry 5→3, core 5→3). Packet content is at its floor: nothing to drop, so the remaining packet lever is encoding density, not layers. Arm files are bench-format (`--compare`, `--rescore` work on them).
- **Output floor (2026-09-14)**: out ≈ 29 + 0.69 × chars of `o` over 573 recorded calls (games 25, 28), no thinking block in any response. Direct calls: `-` 30 tokens, `g idle` 32, an empty `o` 38 (the model cannot write an empty parameter; it leaks the closing tag instead, so every leaked tag in games 25–28, 20 of 935 calls, was a no-op costing 8 tokens more than `-`). `--thinking off` on the bench: same tokens (46 vs 45), same latency, `train` 0/5; stays adaptive/low. Without the tool (`--reply text`, prompt `game29-sonnet.md`) the same line costs only its own tokens (17 against 46) but the model narrates a paragraph before it whatever the wording: bench 67% at 85 out tokens (thinking off), 64% at 94 (adaptive thinks in text), 32% at 75 with sharper wording. The forced tool is what suppresses the narration and its 29 tokens are the price. Flag kept as an experiment variable; the lever is closed.
- **Output**: ids per unit-list order p50 3–8, p90 8–13; ≥ 8 ids ≈ +65 output tokens. The model invents sequential ids it never saw (game 21) and pastes labels rarely; `attack target:0` is its way of saying "go to the enemy base".
- **Packet**: on slim packets the largest layers are army (~50–65 tokens) and last orders (~25–38).
- **Strategy-text defects seen in every game (not fixed: the prompt is frozen)**: the ball attack-moves to the prompt's example coordinates 65,25 / -65,-25 whenever M is absent; `spend everything` makes the model queue harvesters ahead of the barracks (game 25: barracks at 97 s, 483 noore drops in 277 decisions). Both are recorded for the next prompt revision.

## Next steps, in order

1. **Per-class trigger stats** (which trigger classes lead to orders that take, which to no-ops and drops): free, from the run files; then decide cooldowns and the heartbeat by measurement.
2. **≥ 20 games on the working config** for a win rate with error bars (~$1 a game). The harness levers inside the call are spent: output floor (framing), packet content (every layer read), overlap (3 inside noise), streaming (on). What is left is the API's ~1.2 s to the first token and the strategy text, which is frozen.
3. Small: the no-op as `-` (8 tokens and a leaked tag on ~2% of calls) and the L layer in the order language, both in the next prompt revision; short per-game ids.

Open items: the layer-sensitivity tool is done (results above), rerun it whenever a layer's encoding changes; streaming's `prior`/`partial` bookkeeping is unit-tested but the recent-entry merge in the adapter is not covered by an offline socket test; the L layer still prints last orders in the old wording (`train tr #10006 noore`), not the order language; short per-game ids (`10006` → `6`, both directions) untested; the no-op should be `-` not an empty string (tool description and the prompt's format line; 8 tokens and a leaked tag on ~2% of calls), bundle with the next prompt revision; the bench's `remembered` case was 0/5 today on the working config (3/5 on 2026-09-12) and `wave` 4/5, so the bench itself moves ±1 case between days; the test stub model ignores its abort signal, so a mock test must advance virtual time past any call in flight at the end. Trajectory replay validates against the packet's own state where live validates against the newest (the same-config arm attacked 9 times against 2 recorded; check that first); `maxItems` on unit lists as a schema-level cap on id lists; the push rule on the bench is 2–3/5 slim vs 5/5 full and neither `M` nor the anchor closed it.

## Known defects fixed (verify live if touching these areas)

Pending set (game 29): a timed-out call's trigger set stayed in `pendingSets` after the retry took a new n, so the packet's `pending:` line and the recorded `overlap` counted up to 6 calls with a cap of 3. Deleted on the failed path; regression test in `pilot.test.mjs`.

Overlap in-flight count marked once per decision (game 26: marked per retry and reoffer, stuck at 2, every trigger coalesced for 3 minutes). Reconnect single-flight + attempt cap + `close` → `transport` finish; request timeout 10 s; heartbeat rides the next tick and always reschedules; no heartbeat calls in pregame; `Object.hasOwn` on every model-string lookup; per-cmd send results; SIGINT finishes cleanly (exit 130, second Ctrl-C hard exits); `--stale-after` = decision deadline + 2 s; adapter emits `done` before the ended state; calls before the first cache hit get 3× the deadline; a ref'd timer spans reconnect backoff. Review record: `docs/reviews/2026-09-12-harness.md`.

## Environment

- `.env` (gitignored): `ANTHROPIC_API_KEY` (**Sonnet only**), `ASHFALL_HUB` (wss://…), `ASHFALL_KEY`. `ASHFALL_LOCAL=~/workspace/ashfall_sector` enables the local-hub tests and fixture capture.
- `.gitignore` ignores `runs/` and `*.jsonl` (except test fixtures); prompts are tracked.
- `--max-usd 2` ends a long game early (game 29 hit it at 17:54 and idled, since `--concede-on never`): raise it or pass `--concede-on budget` for a game you expect to run long.
- Live game ≈ $0.13 per game-minute on the working config (two calls in flight; $0.06–0.09 with one); a game is 5–15 minutes. Background commands longer than 10 minutes have completed in this environment.
- Account record: hub games 24, 25 (checklist, conceded), 27 (smoke), 28–41 (games 12–24), 34 (stub, stopped at 3 decisions), 42 (game 25, stopped by stop-file at 11:12, conceded by the next run), 43 (game 26, overlap defect, lost at 3:12), 44 (game 27, win 8:00), 45 (game 28, win 7:00), 47 (game 29, overlap 3, budget-stopped at $2, the AI finished the core after the pilot left: a loss on the hub, nothing to concede), 48 (game 30, stream, win 6:42) are on the account.

## Commands

```
npm test
node bin/pilot.mjs --game mock --model none
ASHFALL_LOCAL=../ashfall_sector npm run test:ashfall
ASHFALL_LIVE=1 ASHFALL_CONCEDE_STALE=1 node --test test/games/ashfall/live.test.mjs      # live checklist, concedes leftovers
node bin/pace.mjs --row 28 runs/ashfall-45.jsonl
node bin/replay.mjs runs/ashfall-41.jsonl all
node bin/layers.mjs runs/ashfall-41.jsonl
node bin/discipline.mjs runs/ashfall-31.jsonl runs/ashfall-41.jsonl runs/ashfall-45.jsonl
node bin/bench.mjs --repeats 5 --out /tmp/full.json                                        # full-packet arm
node bin/bench.mjs --repeats 5 --slim --packet-max 1000 --prompt prompts/ashfall/game25-sonnet.md --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true --ashfall-keep-remembered true --ashfall-lang true --out /tmp/arm.json   # the working config's decision arm
node bin/bench.mjs --compare /tmp/full.json /tmp/arm.json
node bin/sensitivity.mjs --repeats 5 --slim --packet-max 1000 --prompt prompts/ashfall/game25-sonnet.md --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true --ashfall-keep-remembered true --ashfall-lang true --out /tmp/sens   # layer sensitivity of the working config
node bin/snapshot.mjs runs/ashfall-36.jsonl --n 191 --out test/games/ashfall/bench/fixtures/dry-t522.json
node bin/trajectory.mjs runs/ashfall-42.jsonl --every 3 --ashfall-keep-remembered true --out /tmp/keepM.json   # arm flags default to the recording's
node bin/trajectory.mjs runs/ashfall-41.jsonl --every 3 --full-every 0 --ashfall-fold-fields false --ashfall-fields-on-demand false --ashfall-no-note false --ashfall-compact-buildings false --out /tmp/fullpkt.json
node bin/trajectory.mjs --compare /tmp/same.json /tmp/fullpkt.json
```

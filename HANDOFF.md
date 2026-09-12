# Handoff — 2026-09-12, night

State of Quickdraw after M0–M6 and M7 through game 27. `npm test` is 118 tests, 3 skipped (need `ASHFALL_LOCAL`, `ASHFALL_LIVE=1`, or a key), under a second on virtual time. Chronology and per-game numbers are in `notes/ashfall/games.md`; this file is where things stand and what to do next.

## Direction

Harness, not strategy. The strategy sections (`## Play` onward) of `prompts/ashfall/game15-sonnet.md` are frozen and byte-identical in every prompt variant (`lang.test.mjs` enforces it for `game25-sonnet.md`, the current prompt); the format section (packet layers, tool, order language) is harness territory and may change once the bench shows decisions do not move. Iterate on seconds per decision and tokens per packet. **Win rate is a confirmation metric only; the bench and trajectory replay are the gates** (see Measurement).

## Working config

```
node bin/pilot.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game25-sonnet.md --packet-max 1000 \
  --full-every 5 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true \
  --ashfall-keep-remembered true --ashfall-lang true --overlap 2 \
  --max-usd 2 --stop-file /tmp/qd-stop --ashfall-concede-stale true
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
- Superseded, kept for replay of games 17–23: `--ashfall-full-buildings`, `--ashfall-keep-anchor`. Untested: `--ashfall-order-cap N`. Worse: `--thinking off` (game 22: slower and longer output).

Expand sugar in the same config (no flag): pasted cluster labels resolve against the state the packet was encoded from (60 of 60 stale-label drops fixed); `idle` in `gather`/`repair`/`build` means idle harvesters, else the harvester nearest the job; `"all army"` splits into selectors; `attack` on a remembered building becomes an attack-move at its position; the tool describes attack's target as "visible in X now".

## Where the seconds are (game 27, reaction p50 2.5 s / p90 3.4 s; game 25 was 3.7 s before overlap, game 24 5.6 s with the JSON tool)

| stage | time | lever |
|---|---|---|
| event waits for the 500 ms state push (p50 0.3–0.5 s), or for two calls in flight (81 of 207 event calls in game 27, p50 1.35 s) | 0.3–0.5 s | event tick (step 2); `--overlap 3` is a cost question |
| prefill (~9k cached + ~650 fresh tokens) | ~0.5 s | little left in the packet |
| output, ~48 tokens with the order language (was 90–120) | ~0.9 s | done; ~40 tokens of the 48 are fixed per call (an empty answer costs 37–54) |
| expand, validate, send | ~0.05 s | done |

Real minus estimated packet tokens is a steady ~150 tokens of message framing, not cuttable.

## Measurement (all offline unless stated)

| tool | question it answers | cost |
|---|---|---|
| `bin/pace.mjs <run…>` (`--row N` prints the games.md row) | pace, latency split, tokens, cache, orders kept, cost | free |
| `bin/replay.mjs <run> all` | encode is pure over the recorded refs (byte-for-byte) | free |
| `bin/layers.mjs <run…>` | per-layer tokens, share, constant and repeat lines | free |
| `bin/discipline.mjs <run…>` | rule adherence of a live game: turret time, first push size/turret-up, pushes, bank, idle harvesters | free |
| `bin/bench.mjs [arm flags] --repeats 5 --out a.json`; `--compare`; `--rescore` | decision quality of a harness config on nine fixed states with the prompt's expected order (`test/games/ashfall/bench/cases.mjs`) | ~$0.20 an arm |
| `bin/snapshot.mjs <run> (--row R \| --n N) --out fixture.json` | a scrubbed, committable fixture from any recorded state | free |
| `bin/trajectory.mjs <run> [--every k] [arm flags] --out a.json`; `--compare`; `--rescore` | open-loop replay of a recorded game under one arm: same states, triggers, last orders, decision numbers; scored on rates and on nine per-decision rules (`test/games/ashfall/bench/rules.mjs`), recording as the reference column | ~$0.006 a decision |
| `bin/rehearse.mjs [--slim] [arm flags] --pick …` | the older fixed-state A/B (threads last orders across picks) | ~$0.02 a call |

Run files from game 24 on are complete captures: `system` (prompt text), `tool` (schema) and `meta` in the config line; every state; per call the packet, triggers, refs, `raw` model response, usage, latency split; per decision the raw orders, sent, dropped; every server result.

Facts the tools established:
- **Noise floor**: the recorded config replayed on itself agrees with the recording on command kinds 54% of the time (game 24, 84 decisions). Compare arms on rates only; under ~15 points at 84 decisions is noise; bench cases need ≥ 5 repeats.
- **Bench** (11 cases since game 25): full packet 76%; slim without `B` 58%; slim + expand sugar 69%; slim + compact `B` 76% at 174 est / 88 output tokens; + order language 98% (the nine older cases) at 46 output tokens. The two game-25 cases: `nobarracks` 5/5, `remembered` 3/5 (the misses send an unhurt ball home). A case is added when a live game shows a decision the bench could not fail on; never tuned to pass.
- **Rule adherence live** (`discipline`): game 15 (full) turret 1:34, pushed at 2:22 with the turret up; games 16–23 (slim, no `B`) pushed at 2:10–3:00 with no turret; game 24 (compact `B`) turret 2:41, push at 3:25 with the turret up. First pushes were never pieces; losses come from the ball dying with no follow-up.
- **Output**: ids per unit-list order p50 3–8, p90 8–13; ≥ 8 ids ≈ +65 output tokens. The model invents sequential ids it never saw (game 21) and pastes labels rarely; `attack target:0` is its way of saying "go to the enemy base".
- **Packet**: on slim packets the largest layers are army (~50–65 tokens) and last orders (~25–38).
- **Strategy-text defects seen in every game (not fixed: the prompt is frozen)**: the ball attack-moves to the prompt's example coordinates 65,25 / -65,-25 whenever M is absent; `spend everything` makes the model queue harvesters ahead of the barracks (game 25: barracks at 97 s, 483 noore drops in 277 decisions). Both are recorded for the next prompt revision.

## Next steps, in order

1. **Layer-sensitivity tool**: bench with each layer removed, so packet content is decided by measured decision sensitivity, not by hand (keep-anchor was the hand version).
2. **Tick on event arrival** (`--event-tick`): the transport already emits events on arrival; the adapter hands them on at the next state push. With overlap the push wait is now the largest slice of the wait (p50 0.3–0.5 s on most event calls). Design: the adapter emits the trigger on arrival, the core ticks with the latest state; do not emit it again on the next push.
3. **Output floor**: an empty answer costs 37–54 output tokens and the p50 is 43, so ~40 tokens a call is fixed overhead (thinking at low effort, tool framing). Measure `--thinking off` again under the language (game 22 was the JSON tool), and a one-character no-op.
4. **Streaming per-cmd dispatch**: `eager_input_streaming`, dispatch each cmd as its JSON closes; open question is validate on a partial list.
5. Then per-class trigger stats and ≥ 20 games on the final config for win rate.

Open items: the L layer still prints last orders in the old wording (`train tr #10006 noore`), not the order language; short per-game ids (`10006` → `6`, both directions) untested; the fixed ~40 output tokens per call are the floor to look at next. Trajectory replay validates against the packet's own state where live validates against the newest (the same-config arm attacked 9 times against 2 recorded; check that first); `maxItems` on unit lists as a schema-level cap on id lists; the push rule on the bench is 2–3/5 slim vs 5/5 full and neither `M` nor the anchor closed it.

## Known defects fixed (verify live if touching these areas)

Overlap in-flight count marked once per decision (game 26: marked per retry and reoffer, stuck at 2, every trigger coalesced for 3 minutes). Reconnect single-flight + attempt cap + `close` → `transport` finish; request timeout 10 s; heartbeat rides the next tick and always reschedules; no heartbeat calls in pregame; `Object.hasOwn` on every model-string lookup; per-cmd send results; SIGINT finishes cleanly (exit 130, second Ctrl-C hard exits); `--stale-after` = decision deadline + 2 s; adapter emits `done` before the ended state; calls before the first cache hit get 3× the deadline; a ref'd timer spans reconnect backoff. Review record: `docs/reviews/2026-09-12-harness.md`.

## Environment

- `.env` (gitignored): `ANTHROPIC_API_KEY` (**Sonnet only**), `ASHFALL_HUB` (wss://…), `ASHFALL_KEY`. `ASHFALL_LOCAL=~/workspace/ashfall_sector` enables the local-hub tests and fixture capture.
- `.gitignore` ignores `runs/` and `*.jsonl` (except test fixtures); prompts are tracked.
- Live game ≈ $0.06–0.09 per game-minute; a game is 5–15 minutes. Background commands longer than 10 minutes have completed in this environment.
- Account record: hub games 24, 25 (checklist, conceded), 27 (smoke), 28–41 (games 12–24), 34 (stub, stopped at 3 decisions), 42 (game 25, stopped by stop-file at 11:12, conceded by the next run), 43 (game 26, overlap defect, lost at 3:12), 44 (game 27, win 8:00) are on the account.

## Commands

```
npm test
node bin/pilot.mjs --game mock --model none
ASHFALL_LOCAL=../ashfall_sector npm run test:ashfall
ASHFALL_LIVE=1 ASHFALL_CONCEDE_STALE=1 node --test test/games/ashfall/live.test.mjs      # live checklist, concedes leftovers
node bin/pace.mjs --row 25 runs/ashfall-42.jsonl
node bin/replay.mjs runs/ashfall-41.jsonl all
node bin/layers.mjs runs/ashfall-41.jsonl
node bin/discipline.mjs runs/ashfall-31.jsonl runs/ashfall-41.jsonl
node bin/bench.mjs --repeats 5 --out /tmp/full.json                                        # full-packet arm
node bin/bench.mjs --repeats 5 --slim --prompt prompts/ashfall/game25-sonnet.md --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true --ashfall-lang true --out /tmp/arm.json
node bin/bench.mjs --compare /tmp/full.json /tmp/arm.json
node bin/snapshot.mjs runs/ashfall-36.jsonl --n 191 --out test/games/ashfall/bench/fixtures/dry-t522.json
node bin/trajectory.mjs runs/ashfall-42.jsonl --every 3 --ashfall-keep-remembered true --out /tmp/keepM.json   # arm flags default to the recording's
node bin/trajectory.mjs runs/ashfall-41.jsonl --every 3 --full-every 0 --ashfall-fold-fields false --ashfall-fields-on-demand false --ashfall-no-note false --ashfall-compact-buildings false --out /tmp/fullpkt.json
node bin/trajectory.mjs --compare /tmp/same.json /tmp/fullpkt.json
```

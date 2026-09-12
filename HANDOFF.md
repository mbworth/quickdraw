# Handoff — 2026-09-12, end of day

State of Quickdraw after M0–M6 and the first day of M7 (games 12–24). Everything is committed on `main`; `npm test` is 106 tests, 3 skipped (need `ASHFALL_LOCAL`, `ASHFALL_LIVE=1`, or a key), under a second on virtual time. Chronology and per-game numbers are in `notes/ashfall/games.md`; this file is where things stand and what to do next.

## Direction

Harness, not strategy. `prompts/ashfall/game15-sonnet.md` (sha `cc08728a…`) is the frozen prompt for every experiment: strategy sections are byte-identical across games; the format section (packet layers, tool) is harness territory and may change once the bench shows decisions do not move. Iterate on seconds per decision and tokens per packet. **Win rate is a confirmation metric only; the bench and trajectory replay are the gates** (see Measurement).

## Working config

```
node bin/pilot.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game15-sonnet.md \
  --full-every 5 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true \
  --max-usd 1.5 --stop-file /tmp/qd-stop --ashfall-concede-stale true
```

What each flag does, and why it is on (all off by default so old runs replay byte for byte):
- `--full-every 5`: fields and remembered layers on one packet in five. Packet 720 → ~430 real tokens (games 17–19).
- `--ashfall-fold-fields`: unexplored fields collapse into one `f? f3@x,z …` line, positions kept.
- `--ashfall-fields-on-demand`: fields stay on every packet while a harvester is idle or a worked field is dry; the gather order needs a node id (game 19: 24 blind gathers → 0 in game 20).
- `--ashfall-no-note`: schema without `note`; output 121 → 89 tokens (game 23).
- `--ashfall-compact-buildings`: one always-on `B` line, ids and types, positions for core and turrets, hp/bld only when hurt or unfinished. The prompt's whole build logic reads `B`; with it on the bench the slim packet matches the full packet (76%) at 39% of the tokens.
- Superseded, kept for replay of games 17–23: `--ashfall-full-buildings`, `--ashfall-keep-anchor`, `--ashfall-keep-remembered`. Untested: `--ashfall-order-cap N`. Worse: `--thinking off` (game 22: slower and longer output).

Expand sugar in the same config (no flag): pasted cluster labels resolve against the state the packet was encoded from (60 of 60 stale-label drops fixed); `idle` in `gather`/`repair`/`build` means idle harvesters, else the harvester nearest the job; `"all army"` splits into selectors; `attack` on a remembered building becomes an attack-move at its position; the tool describes attack's target as "visible in X now".

## Where the seconds are (game 23–24, reaction p50 5.4–5.6 s in a slow API hour; 3.9–4.3 s in games 17–21)

| stage | time | lever |
|---|---|---|
| event waits for the 500 ms state push, then a tick, then any call in flight | 1.1–2.0 s | steps 3–4 below |
| prefill (~9k cached + ~400 fresh tokens) | ~0.5 s | little left in the packet |
| output, 90–120 tokens at 17–20 ms each | 1.5–2.0 s | output format (step 1 below) |
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
- **Bench**: full packet 76%; slim without `B` 58%; slim + expand sugar 69%; slim + compact `B` 76% at 174 est / 88 output tokens.
- **Rule adherence live** (`discipline`): game 15 (full) turret 1:34, pushed at 2:22 with the turret up; games 16–23 (slim, no `B`) pushed at 2:10–3:00 with no turret; game 24 (compact `B`) turret 2:41, push at 3:25 with the turret up. First pushes were never pieces; losses come from the ball dying with no follow-up.
- **Output**: ids per unit-list order p50 3–8, p90 8–13; ≥ 8 ids ≈ +65 output tokens. The model invents sequential ids it never saw (game 21) and pastes labels rarely; `attack target:0` is its way of saying "go to the enemy base".
- **Packet**: on slim packets the largest layers are army (~50–65 tokens) and last orders (~25–38).

## Next steps, in order

1. **Output command language** (the largest remaining lever, ~60% of output tokens is JSON keys and ids). One string field, e.g. `t 12 tr 2; m army 65,25 a`, decoded by expand; short per-game entity ids (renumbered client side, both directions); grid coordinates where precision is not needed. Needs the prompt's format section to change (strategy sections frozen). Gate: bench ≥ 76% and trajectory rule rates within noise of the current config, then one live game for pace.
2. **Layer-sensitivity tool**: bench with each layer removed, so packet content is decided by measured decision sensitivity, not by hand (keep-anchor was the hand version).
3. **Tick on event arrival** (`--event-tick`): an event waits for the next 500 ms state push today; 145 of 326 trigger outcomes in game 12 coalesced. Measure `waitP50`.
4. **Overlapping calls**: a second call while one is in flight, each validated against the newest state on return. Design question: ordering of sends and `lastOrders` across two in-flight decisions.
5. **Streaming per-cmd dispatch**: `eager_input_streaming`, dispatch each cmd as its JSON closes; open question is validate on a partial list.
6. Then per-class trigger stats and ≥ 20 games on the final config for win rate.

Open items: trajectory replay validates against the packet's own state where live validates against the newest (the same-config arm attacked 9 times against 2 recorded; check that first); `maxItems` on unit lists as a schema-level cap on id lists; the push rule on the bench is 2–3/5 slim vs 5/5 full and neither `M` nor the anchor closed it.

## Known defects fixed (verify live if touching these areas)

Reconnect single-flight + attempt cap + `close` → `transport` finish; request timeout 10 s; heartbeat rides the next tick and always reschedules; no heartbeat calls in pregame; `Object.hasOwn` on every model-string lookup; per-cmd send results; SIGINT finishes cleanly (exit 130, second Ctrl-C hard exits); `--stale-after` = decision deadline + 2 s; adapter emits `done` before the ended state; calls before the first cache hit get 3× the deadline; a ref'd timer spans reconnect backoff. Review record: `docs/reviews/2026-09-12-harness.md`.

## Environment

- `.env` (gitignored): `ANTHROPIC_API_KEY` (**Sonnet only**), `ASHFALL_HUB` (wss://…), `ASHFALL_KEY`. `ASHFALL_LOCAL=~/workspace/ashfall_sector` enables the local-hub tests and fixture capture.
- `.gitignore` ignores `runs/` and `*.jsonl` (except test fixtures); prompts are tracked.
- Live game ≈ $0.06–0.09 per game-minute; a game is 5–15 minutes. Background commands longer than 10 minutes have completed in this environment.
- Account record: hub games 24, 25 (checklist, conceded), 27 (smoke), 28–41 (games 12–24), 34 (stub, stopped at 3 decisions) are on the account.

## Commands

```
npm test
node bin/pilot.mjs --game mock --model none
ASHFALL_LOCAL=../ashfall_sector npm run test:ashfall
ASHFALL_LIVE=1 ASHFALL_CONCEDE_STALE=1 node --test test/games/ashfall/live.test.mjs      # live checklist, concedes leftovers
node bin/pace.mjs --row 24 runs/ashfall-41.jsonl
node bin/replay.mjs runs/ashfall-41.jsonl all
node bin/layers.mjs runs/ashfall-41.jsonl
node bin/discipline.mjs runs/ashfall-31.jsonl runs/ashfall-41.jsonl
node bin/bench.mjs --repeats 5 --out /tmp/full.json                                        # full-packet arm
node bin/bench.mjs --repeats 5 --slim --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true --out /tmp/arm.json
node bin/bench.mjs --compare /tmp/full.json /tmp/arm.json
node bin/snapshot.mjs runs/ashfall-36.jsonl --n 191 --out test/games/ashfall/bench/fixtures/dry-t522.json
node bin/trajectory.mjs runs/ashfall-41.jsonl --every 3 --out /tmp/same.json               # arm flags default to the recording's
node bin/trajectory.mjs runs/ashfall-41.jsonl --every 3 --full-every 0 --ashfall-fold-fields false --ashfall-fields-on-demand false --ashfall-no-note false --ashfall-compact-buildings false --out /tmp/fullpkt.json
node bin/trajectory.mjs --compare /tmp/same.json /tmp/fullpkt.json
```

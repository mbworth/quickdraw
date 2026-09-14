# Handoff — 2026-09-14

Where Quickdraw stands and what to do next. History lives in `notes/ashfall/games.md` (every game, one row, and what it taught), `docs/reviews/` (the four reviews and what they fixed) and `git log`. Nothing here repeats those.

## State

M0–M7 built; 55 live games; `npm test` 161 tests, 3 skipped without `ASHFALL_LOCAL`/`ASHFALL_LIVE`/a key, ~7 s. The harness levers inside a call are spent: reaction p50 5.6 s (game 24) → 2.2 s (game 30) by the order language, two calls in flight, the event tick and streaming dispatch; output 101 → 38 tokens, of which 29 are the forced tool call's framing; every packet layer is read (sensitivity); a third slot and a reserved slot sit inside one game's noise. Win rate on the game38 prompt (2026-09-14 evening campaigns): **the script 10 of 11** (games 39–49, 4.5–7.1 min, $0), **the model 4 of 5** (games 50–54, 5.4–14.6 min, $6.90); game 38 was the model's earlier loss on a quiet-packet commit.

**2026-09-14, late: the three-way split.** Every loss was ambiguous between the packet, the strategy and the model. Now `src/games/ashfall/policy/game38.mjs` plays the game38 prompt as code from the packet text alone (`src/games/ashfall/read.mjs` reads the packet back into facts, strict on the structured layers), through the same `callModel` seam as the API (`--model script:game38`, `scriptModel` in `src/core/model.mjs`, no key, $0). What it answers:
- **Is the packet sufficient?** The script passes the bench 13/13 on the working config and reads every packet of every recording (6,561). Anything it cannot read throws (`stop: error:read`), never a silent `-`.
- **Does the strategy win?** The script plays live at zero API cost: its win rate is the strategy's, at the harness's own speed. Campaign `script-game38` (games 39–49): 10 of 11, every game 4.5–7.1 min, barracks at 9 s, first commit 15–20 riflemen at 3:20–4:50, 1–4 pushes, ore p50 35–45. The loss (game 47): the commit at 3:46 with 16 met the enemy's home army and died. Reaction p50 0 s at 50–60 decisions a minute is the harness floor. Plan and packet are sufficient.
- **What is the model's share?** Campaign `model-game38` (games 50–54, Sonnet, same prompt and packet): 4 of 5, but 5.4–14.6 min (three games over 11 min), 14–71 pushes a game against the script's 1–4, first pushes of 7–8 riflemen in two games (Army 7 says 15), ore p50 45–95 with up to 44% of samples over 120 banked. `trajectory --model script:game38` on those runs: purchases agree 52–69%, army 58–86%, both 31–45% (game 38: 51 / 95). The model wins about as often on this sample but takes twice as long and dribbles; that is the model's share, and it is the strategy's slack that absorbs it. Wilson intervals at 5 and 11 games overlap (38–96 vs 60–98), so the win rates do not separate; the minutes and pushes do.

## Working config

```
node bin/pilot.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game55-sonnet.md --packet-max 1000 \
  --full-every 5 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true \
  --ashfall-keep-remembered true --ashfall-lang true --ashfall-search-fields true --ashfall-guide true --ashfall-plan-marks true --overlap 2 --event-tick --stream \
  --max-usd 2 --concede-on budget --stop-file /tmp/qd-stop --ashfall-concede-stale true
```
The script plays the same line with `--model script:game38` and no `--prompt`/`--stream` (it reads the raw facts, so the marks are inert for it). game55 + marks adopted after game 55 (one live win on the bench gate; the marks themselves have not yet fired live). All flags are off by default so old runs replay byte for byte.

| flag | what it does | gated by |
|---|---|---|
| `--full-every 5` | fields and remembered on one packet in five; packet 720 → 430 tokens | games 17–19 |
| `--ashfall-fold-fields` | unexplored fields on one `f?` line, positions kept | game 17 |
| `--ashfall-fields-on-demand` | `F` on every packet while a harvester is idle or a field is dry (gather needs a node id) | game 20: blind gathers 24 → 0 |
| `--ashfall-no-note` | schema without `note`; output 121 → 89 | game 23 |
| `--ashfall-compact-buildings` | one always-on `B` line: ids, types, anchor positions, hp/bld only when hurt or unfinished | bench: equals the full packet at 39% of its tokens |
| `--ashfall-keep-remembered` | `M` on every packet at army priority (game 25: the enemy base reached the model on 1 packet of 118) | trajectory: pushTarget 22/25 vs 1/14 |
| `--ashfall-lang` | one string out, decoded by `lang.mjs`; output 88 → 46, reaction 5.6 → 3.7 s | bench 98%, game 25 |
| `--ashfall-search-fields` | `M` names the search waypoint while 8+ riflemen have no listed target | bench search 10/10, games 32–33 |
| `--ashfall-guide` | `wk N tr N` on `H`, `post@`/`yard@`/`(no tu)` on `B`, `out` marks, mirror-first waypoint, no `hb` on `T` | bench 68% → 92%, game 38 |
| `--ashfall-plan-marks` (with guide, prompt game55) | `out failed` on a rally under 5 riflemen, `(2nd ba)` on `B` when Buy 5 holds | bench failed 0→4/5, secondba 0→3/5; game 55 win 4:54 (neither mark fired) |
| `--packet-max 1000` | a rail, not a shaping tool (the 600 default cut nothing useful) | game 25 replay |
| `--overlap 2` | a ranked trigger may start a second call while one is in flight; reaction 3.7 → 2.5 s | game 27 (26 was the defect run) |
| `--event-tick` | decide on event arrival on the latest state; event wait 0.49 → 0.18 s | game 28 |
| `--stream` | each command sent as its `;` closes; first order 0.6 s earlier on multi-command answers | game 30 |
| `--overlap 3`, `--reserve danger,contact,loss` | inside one game's noise / did its job but the opening starved; both off, A/B candidates | games 29, 31 |
| `--thinking off`, `--reply text` | worse (longer output; the model narrates without the tool) | games 22, bench |

## Measurement (offline unless stated)

| tool | question | cost |
|---|---|---|
| `bin/pace.mjs <run…>` (`--row N`) | pace, latency split, tokens, cache, cost; the games.md row | free |
| `bin/replay.mjs <run> all` | encode is pure over the recorded refs (byte for byte) | free |
| `bin/layers.mjs`, `bin/classes.mjs`, `bin/discipline.mjs <run…>` | tokens per layer; what each trigger class buys; rule adherence of a live game | free |
| `bin/bench.mjs [arm] --repeats 5 --out a.json`; `--compare`; `--rescore` | decision quality on 13 fixed states (`test/games/ashfall/bench/cases.mjs`) | ~$0.20 an arm; `--model script:game38 --repeats 1` free |
| `bin/trajectory.mjs <run> [--every k] [arm] --out a.json`; `--compare`; `--rescore` | a recording re-decided under one arm: agreement with the recording, ten per-decision rules; with `--model script:<name> --diff`: Buy/Army agreement per decision and every disagreement printed with its packet | ~$0.006 a decision; script free |
| `bin/sensitivity.mjs [arm] --repeats 5 --out dir` | the bench with one layer removed, per layer | ~$1.30; script free |
| `bin/campaign.mjs --games N [--ab flag=value] -- <pilot flags>`; `--report` | N live games, A/B alternating, resumable, games.md rows, per-arm win rate with a Wilson interval | ~$1 a game; $0 with the script |
| `bin/snapshot.mjs <run> --n N --out f.json`, `bin/rehearse.mjs` | a scrubbed fixture from a recorded state; the older fixed-state A/B | free / ~$0.02 a call |

Timing levers (overlap, event tick, stream) cannot be measured offline; one live game, read with `pace`. Runs from game 24 on are complete captures (prompt, schema, every state, packet, raw response, latency split, every result).

## Facts that steer

- **Noise floor**: the same config replayed on itself agrees with its recording on command kinds 54% of the time. Compare arms on rates; under ~15 points at 84 decisions is noise; bench cases need 5 repeats (the script needs 1).
- **Output floor**: out ≈ 29 + 0.69 × chars of `o`; the 29 is the tool framing and it is what suppresses narration. Closed.
- **Packet content is at its floor**: removing any layer costs more than the day-to-day drift. The remaining packet lever is encoding density, now testable for free: what the script reads is necessary, what it never reads is a drop candidate.
- **Trigger contention**: economy triggers are 34–38% of calls at 40% no-op; with two slots half the danger/contact/loss triggers coalesce behind economy and done calls. `--reserve` fixes that share and starves the opening; undecided.
- **Model vs plan (game 38)**: army 95%, purchases 51%; the misses are purchases not made. Whether that costs games is what the script's live record will say.

## Next, in order

1. **The model's departures, read and half closed (2026-09-14 night, all offline).** `trajectory --model script:game38 --diff` on runs 70–74 with a 6-decision window (the script re-issues standing orders every packet; the model says them once; `buyAgreeW`/`armyAgreeW`): purchases 64–84%, army 63–88%. The residue is four compound rules the model skips: rally out with under 5 riflemen (never recalled: 120 packets in game 52), a cluster out while the rally is home (81), the second barracks at 200 ore with every queue full (never built: 107), a raid at home the riflemen outnumber (21); plus one decisive stochastic one, the commit with 8 on a kill packet (game 50 at 2:46). Three new bench cases from those states: `sally`, `secondba`, `failed`. Sonnet on the game38 packet: sally 5/5 (does not reproduce offline), secondba 0/5, failed 0/5. `--ashfall-plan-marks` puts the two compound conditions where their rule reads them (`out failed` on the rally, `(2nd ba)` on B): with the game38 prompt still 0/5 and 0/5 (a mark the prompt does not name is ignored); with `game55-sonnet.md` (game38 plus four lines naming them) failed 4/5, secondba 3/5, the full 16 cases 86% with the same two old misses (`train`, `remembered` 1/5). Arm files `runs/bench/2026-09-14-game55-*.json`, `…-departures-*.json`. **Game 55 (hub 76), the first live game on game55 + marks: win in 4:54, $0.61**, the model's fastest and closest to the plan (first push 16 at 4:06, 10 pushes, ore p50 45; windowed agreement purchases 79%, army 93% against 64–84 / 63–88 in games 50–54). One game, and **neither mark fired in it** (no packet carried `(2nd ba)` or `out failed`: ore never sat at 200 with a full queue and the attack never failed), so the win confirms the prompt's four lines do no harm, not that the marks work live; that needs a game that enters those states. The working config adopts game55 + marks on the bench gate. The second barracks is the open bench miss (3/5): the model attacks the visible core and buys nothing.
2. **Longer campaigns only when a change needs them**: 10 games an arm gives ±26 points; the script arm is free, the model arm ~$1.40 a game (its games run long). Note the model's games grew through the evening (5.4 → 14.6 min, reaction p50 2.1 → 2.5 s) while the hub was stuttering (`ashfall_sector/requests/2026-09-14-live-hub-stutter.md`): rerun one model game after the hub fix before reading the minutes as the model's.
3. **Deterministic sensitivity**: `sensitivity.mjs --model script:game38`; then instrument `read.mjs` to log which fields the policy touched per decision and drop what it never reads.
4. Small, open: the `L` layer still prints the old wording, not the order language; short per-game ids; the `search` second step untested live; `T placed ba#N` can arrive before `B` lists it (event tick on an older state; game 38 n=2), so a per-packet script re-issues the build and the repeat check drops it.

## Environment

- `.env` (gitignored): `ANTHROPIC_API_KEY` (**Sonnet only**), `ASHFALL_HUB` (wss://…), `ASHFALL_KEY`. `ASHFALL_LOCAL=~/workspace/ashfall_sector` enables the local-hub tests and fixture capture. `runs/` and `*.jsonl` are ignored except test fixtures.
- Live game ≈ $0.13 per game-minute on the working config, 5–15 minutes a game; `--max-usd 2 --concede-on budget` ends a long one. The script costs nothing but the hub seat.
- Hub games on the account are listed at the end of `notes/ashfall/games.md`; a run cut at start is conceded stale by the next run.

## Commands

```
npm test
node bin/pilot.mjs --game mock --model none
ASHFALL_LOCAL=../ashfall_sector npm run test:ashfall
ASHFALL_LIVE=1 ASHFALL_CONCEDE_STALE=1 node --test test/games/ashfall/live.test.mjs      # live checklist, concedes leftovers
node bin/pace.mjs --row 39 runs/ashfall-59.jsonl
node bin/bench.mjs --model script:game38 --repeats 1 --slim --packet-max 1000 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true --ashfall-keep-remembered true --ashfall-lang true --ashfall-search-fields true --ashfall-guide true   # the strategy as code on the bench, free; swap in --model claude-sonnet-5 --prompt prompts/ashfall/game38-sonnet.md --repeats 5 for the model arm (~$0.20)
node bin/trajectory.mjs runs/ashfall-58.jsonl --every 1 --model script:game38 --diff --out runs/traj/58-script.json   # model vs plan, per decision, free
node bin/campaign.mjs --games 10 -- --game ashfall --model script:game38 --packet-max 1000 --full-every 5 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true --ashfall-keep-remembered true --ashfall-lang true --ashfall-search-fields true --ashfall-guide true --overlap 2 --event-tick --stop-file /tmp/qd-stop --ashfall-concede-stale true   # the strategy's win rate, $0
node bin/replay.mjs runs/ashfall-58.jsonl all
node bin/discipline.mjs runs/ashfall-58.jsonl runs/ashfall-59.jsonl
node bin/sensitivity.mjs --model script:game38 --repeats 1 --slim --packet-max 1000 <working packet flags> --out /tmp/sens
node bin/snapshot.mjs runs/ashfall-58.jsonl --n 191 --out test/games/ashfall/bench/fixtures/name-tNNN.json
```

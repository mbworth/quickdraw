# Handoff — 2026-09-14

Where Quickdraw stands and what to do next. History lives in `notes/ashfall/games.md` (every game, one row, and what it taught), `docs/reviews/` (the four reviews and what they fixed) and `git log`. Nothing here repeats those.

## State

M0–M7 built; 39 live games; `npm test` 161 tests, 3 skipped without `ASHFALL_LOCAL`/`ASHFALL_LIVE`/a key, ~7 s. The harness levers inside a call are spent: reaction p50 5.6 s (game 24) → 2.2 s (game 30) by the order language, two calls in flight, the event tick and streaming dispatch; output 101 → 38 tokens, of which 29 are the forced tool call's framing; every packet layer is read (sensitivity); a third slot and a reserved slot sit inside one game's noise. Win rate on the game38 prompt: the model 0 of 1 live (game 38, a commit on a quiet packet; the prompt now commits on a kill packet only), the script 1 of 1 (game 39).

**2026-09-14, late: the three-way split.** Every loss was ambiguous between the packet, the strategy and the model. Now `src/games/ashfall/policy/game38.mjs` plays the game38 prompt as code from the packet text alone (`src/games/ashfall/read.mjs` reads the packet back into facts, strict on the structured layers), through the same `callModel` seam as the API (`--model script:game38`, `scriptModel` in `src/core/model.mjs`, no key, $0). What it answers:
- **Is the packet sufficient?** The script passes the bench 13/13 on the working config and reads every packet of every recording (6,561). Anything it cannot read throws (`stop: error:read`), never a silent `-`.
- **Does the strategy win?** The script plays live at zero API cost: its win rate is the strategy's, at the harness's own speed (reaction with no model latency = the harness floor). Game 39, the first: **win in 7:06**, barracks 9 s, turret 4:49, the commit at 4:53 with 19 on a kill packet, reaction p50 0 s (421 decisions, 60 a minute).
- **What is the model's share?** `trajectory --model script:game38 --diff` re-decides a recording and scores whether the model's order agreed with the script's Buy and Army lines. Game 38: army lines agree 95%, purchases 51%, and in 104 of the 146 purchase disagreements the model bought nothing where the ladder said buy (Buy 4 riflemen 36, Buy 3 harvester 32, Buy 5 second barracks 13, Buy 1 depot 12, Buy 6 harvester 11). The model's departure from the plan is the purchase ladder, not the army.

## Working config

```
node bin/pilot.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game38-sonnet.md --packet-max 1000 \
  --full-every 5 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true \
  --ashfall-keep-remembered true --ashfall-lang true --ashfall-search-fields true --ashfall-guide true --overlap 2 --event-tick --stream \
  --max-usd 2 --concede-on budget --stop-file /tmp/qd-stop --ashfall-concede-stale true
```
The script plays the same line with `--model script:game38` and no `--prompt`/`--stream`. All flags are off by default so old runs replay byte for byte.

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

1. **Game 39 read** (run 59, `pace --row 39`, `discipline`): the script won, so the plan and the packet are sufficient for at least one game; one game is one game, hence step 2.
2. **Script campaign**: `bin/campaign.mjs --games 10 -- --game ashfall --model script:game38 <working flags minus --prompt --stream>`: the strategy's win rate at $0. Then the model campaign on the same prompt for the comparison; the difference is the model's share.
3. **Purchase gap**: the model skips Buy lines it can see (game 38). Options in order of cost: reword the Buy section so a purchase is the first thing written; put the ladder's own verdict on the packet (`H buy:tr` — the guide idea taken one step further, cheap to test on the bench against the script's line); accept it if the script campaign shows the ladder does not decide games.
4. **Deterministic sensitivity**: `sensitivity.mjs --model script:game38`; then instrument `read.mjs` to log which fields the policy touched per decision and drop what it never reads.
5. Small, open: the `L` layer still prints the old wording, not the order language; short per-game ids; the `search` second step untested live; `T placed ba#N` can arrive before `B` lists it (event tick on an older state; game 38 n=2), so a per-packet script re-issues the build and the repeat check drops it.

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

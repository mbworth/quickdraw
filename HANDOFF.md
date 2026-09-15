# Handoff — 2026-09-15

Where Quickdraw stands and what to do next. History lives in `notes/ashfall/games.md` (every game, one row, and what it taught), `docs/reviews/` (the four reviews and what they fixed) and `git log`. Nothing here repeats those.

## State

M0–M11 built; Ashfall 55 live games (hub games 1–76), MicroRTS 5 scripted games (5/5 vs `ai.abstraction.WorkerRush`); `npm test` 235 tests, 229 pass, 6 skipped without a key or `MICRORTS_LOCAL`, 7 s. The harness levers inside a call are spent: reaction p50 5.6 s (game 24) → 2.2 s (game 30) by the order language, two calls in flight, the event tick and streaming dispatch; output 101 → 38 tokens, of which 29 are the forced tool call's framing; every packet layer is read (sensitivity); a third slot and a reserved slot sit inside one game's noise. Win rate on the game38 prompt (2026-09-14 evening campaigns): **the script 10 of 11** (games 39–49, 4.5–7.1 min, $0), **the model 4 of 5** (games 50–54, 5.4–14.6 min, $6.90); game 38 was the model's earlier loss on a quiet-packet commit.

**2026-09-14, late: the three-way split.** Every loss was ambiguous between the packet, the strategy and the model. Now `src/games/ashfall/policy/game38.mjs` plays the game38 prompt as code from the packet text alone (`src/games/ashfall/read.mjs` reads the packet back into facts, strict on the structured layers), through the same `callModel` seam as the API (`--model script:game38`, `scriptModel` in `src/core/model.mjs`, no key, $0). What it answers:
- **Is the packet sufficient?** The script passes the bench 13/13 on the working config and reads every packet of every recording (6,561). Anything it cannot read throws (`stop: error:read`), never a silent `-`.
- **Does the strategy win?** The script plays live at zero API cost: its win rate is the strategy's, at the harness's own speed. Campaign `script-game38` (games 39–49): 10 of 11, every game 4.5–7.1 min, barracks at 9 s, first commit 15–20 riflemen at 3:20–4:50, 1–4 pushes, ore p50 35–45. The loss (game 47): the commit at 3:46 with 16 met the enemy's home army and died. Reaction p50 0 s at 50–60 decisions a minute is the harness floor. Plan and packet are sufficient.
- **What is the model's share?** Campaign `model-game38` (games 50–54, Sonnet, same prompt and packet): 4 of 5, but 5.4–14.6 min (three games over 11 min), 14–71 pushes a game against the script's 1–4, first pushes of 7–8 riflemen in two games (Army 7 says 15), ore p50 45–95 with up to 44% of samples over 120 banked. `trajectory --model script:game38` on those runs: purchases agree 52–69%, army 58–86%, both 31–45% (game 38: 51 / 95). The model wins about as often on this sample but takes twice as long and dribbles; that is the model's share, and it is the strategy's slack that absorbs it. Wilson intervals at 5 and 11 games overlap (38–96 vs 60–98), so the win rates do not separate; the minutes and pushes do.

**Fidelity (2026-09-14, `bin/oracle.mjs`, free).** The script decides twice on every recorded decision — once from the packet the model saw, once from facts built straight from that packet's state (`src/games/ashfall/facts.mjs`, same gameOpts, nothing budgeted away) — so the packet's losses are measured without a model. Over the 18 runs whose packets the script can read (58–74, 76): **5,958 decisions, 100% identical orders, every run 100%, zero read errors on either side**. The 31 runs before game 58 predate `--ashfall-guide` and error on both sides (6,302 decisions, `no post/yard`), as they must. The packet does lose information — `F` differs on 4,047 of 5,958 decisions (68%), the `--full-every 5` cadence — but never a decision, because `--ashfall-fields-on-demand` puts `F` back exactly when the gather rule reads it; drop that flag and the same states answer `g idle` without a node id (`test/games/ashfall/facts.test.mjs`). No other layer differs at all, so at the working config the packet is a lossless carrier of this plan — under v1, whose state side mirrored the encoder's shaping; v2 (below) reads 93%.

**Game two (2026-09-15): MicroRTS.** `src/games/microrts/` is the adapter, added with **`git diff src/core` empty** —
X5 is met. The engine dials into a TCP server the adapter opens and blocks on every reply, so the adapter owns the game's
clock; an order is a standing goal the buffer steps one engine action per cycle. Four numbers: **fidelity 100% exact over
716 decisions across 5 runs, 0 read errors** under oracle v1 (36% under v2, below; `bin/oracle.mjs --policy rush`), **298 tokens a packet** (countTokens-calibrated 2026-09-15, divisor 1.28 in `src/games/microrts/calibration.json`; the 3.5 placeholder had said ~120; target was 400), **reaction p50 0.4–0.5 s**, one `refreshMs` — the floor for a 500 ms state cadence — at 55–60 decisions a minute,
and **5 of 5 against `ai.abstraction.WorkerRush`** at $0 (`notes/microrts/games.md`). `bin/oracle.mjs`, `bin/bench.mjs`
and `bin/trajectory.mjs` all run on `--game microrts` with no change of their own; `bin/record.mjs`, `bin/snapshot.mjs`
and `bin/discipline.mjs` are Ashfall-only; `bin/campaign.mjs` counted a draw as undecided until 2026-09-15 (fixed:
a draw is a decided game), so the five games ran from a loop (REQUIREMENTS X5).

Getting there needed one engine patch and four adapter facts, all in `src/games/microrts/remote-game-utt.patch` and
§9b: stock CLIENT mode builds two `UnitTypeTable`s and compares unit types by identity, so **no socket client and no
scripted opponent could ever produce a unit**; `fillWithNones` makes every idle unit look busy, which hid every producer
nine cycles in ten; the engine cancels two units heading for the same cell, even across cycles; and an attack-move at an
occupied cell can never arrive, so a push at their base stood outside it for a thousand cycles. Next for MicroRTS: a
model game on `prompts/microrts/game01-sonnet.md` (never played — the key is Sonnet-only and this was all $0), the
other scripted opponents, and the harvester rule in `policy/rush.mjs` reading standing orders rather than engine action
state. working config is now `--microrts-split-states true --microrts-goal-state true` (campaign 3, 5/5, 1.5–1.9 min).

**Oracle v2 (2026-09-15).** The state side is now the full state view, not the encoder's shaping: every unit its own
A entry with its own state, every building its position, F unfolded (`facts.mjs` both games; `encode(input, {full: true})`
/ `--<game>-full true` renders the same view so the invariant test still holds; every shipping config replays byte for
byte). `same` is decision equivalence — both order strings decoded and expanded against the recorded state, effective
command sets compared — not text; layer facts compare order-insensitively. Ashfall 93% over 5,958 (A and compact B on
all 410 lost decisions, F cadence on 294); MicroRTS 36% same / 31% exact over 716, the whole loss A's one-state-per-cluster
fold (`notes/microrts/games.md` for the two `--diff` cases).

**Oracle v3 (2026-09-15, later).** `bin/oracle.mjs --arm <--<game>-* flags>` re-encodes the packet side from the recorded
inputs under overlaid gameOpts with the recorded budget (replay's exact assemble call; an empty arm reproduces the
non-arm numbers, asserted in tests), so a packet flag is scored offline against existing recordings before any live game.
X is unfolded on the state side too (per-entity cell, id, dB/dA; `full` renders the same). Numbers: Ashfall 92% over
5,958; per-layer ablation against the unshaped view: A 415, X 108, B 0, F 0, budget/cadence 0 — compact B was
co-attributed on every lost decision and causal on none, and `--ashfall-fields-on-demand` puts F back exactly where the
gather rule reads it. Of the 67 decisions X's unfold costs Ashfall, 39 are a target moving from centroid to cell, 20 are
Army 1 reading a cluster's `n` (a rule written against the fold, now inexpressible — fix the rule to count within r), 8
are a raider the fold had hidden. MicroRTS 34% same / 28% exact (A 456, X 71); **`--microrts-split-states true`
(A clusters by type and state) reads 58% / 51% at +9 tokens a packet**, the remainder positional (which idle worker a
centroid sorts nearest). **Its live gate failed: campaign 2 went 2 of 5** (games 6–10) — first Light 474 vs 434 in
every game, harvester node swaps 49–84 vs 12–32. The fold had been stabilizing the policy's harvester rule by accident
(a walking harvester reads `m`; two walkers on one centroid sort by id). Fidelity is not quality: the oracle's reference
side churns the same way, and per-decision equivalence cannot see a standing order across decisions. The fix is
`--microrts-goal-state` (the unit's standing order from the buffer as its A state, `goal` recorded on every unit).
**Campaign 3 with both flags: 5 of 5 in 1.5–1.9 min** (games 11–15; campaign 1 was 2:24–2:36), harvest orders 6–13 a
game against 165–206, node swaps 1 against 12–32; fidelity on those recordings 89% same / 64% exact over 471 (64% with
`--arm --microrts-goal-state false`). Both flags are MicroRTS's working config (`notes/microrts/README.md`). Pre-existing and unrelated: `runs/ashfall-43..57` do not replay byte for byte (`L` carries
`dropped:noore` entries replay does not reproduce, shifting F/M under the budget); 58 on hold. The replay gate is 58+.

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
| `bin/oracle.mjs <run…> [--every k] [--diff] [--out f.json]` | packet fidelity: the scripted policy decided from the recorded packet vs from the raw state; agreement rate, per-layer facts differences, and which layer each disagreement came from | free |
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
4. **The harness's own scoreboard, per game**: fidelity (`oracle`, decision equivalence of script(packet) vs script(state)), tokens per packet at that fidelity (`layers`), the reaction floor with the script in the seat (`pace` on a script game), and the core diff on a second game (X5, zero). A packet change is gated on the oracle staying at 100% before the bench. The second game is the open item; model campaigns on Ashfall are done unless a harness change needs one.
5. ~~Oracle v2, the state side unbudgeted~~ shipped 2026-09-15; v3 (`--arm`, X unfolded, per-layer ablation) the same day (State above). Open from it: Ashfall's A loss is 415 decisions, mostly the centroid-to-cell target and Army 1's cluster-`n` test — fix the rule, or give equivalence a same-entity target tolerance; an Ashfall A split-states arm can now be scored offline with `--arm` before a live game; the 43–57 replay divergence.
6. Small, open: the `L` layer still prints the old wording, not the order language; short per-game ids; the `search` second step untested live; `T placed ba#N` can arrive before `B` lists it (event tick on an older state; game 38 n=2), so a per-packet script re-issues the build and the repeat check drops it.

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

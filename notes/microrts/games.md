# MicroRTS vs the built-in scripted AIs

Local engine, `maps/16x16/basesWorkers16x16.xml` against `ai.abstraction.WorkerRush` unless noted, `--microrts-cycle-ms 100`
(the adapter's reply delay is the game's clock, so a cycle is 100 ms of real time). The clone must carry
`src/games/microrts/remote-game-utt.patch`. Scripted-policy games cost $0.

| game | id | model | result | time | notes |
|---|---|---|---|---|---|
| 1 | basesWorkers16x16-WorkerRush-mu2jndx2 | script:rush, quickdraw | **win** | 2:30 | 140 decisions (55.1/min), reaction p50 0.5 s / p90 0.5 s, packet est p50 ~120, kept 61.7%, $0 |
| 2 | basesWorkers16x16-WorkerRush-mu2jqntf | script:rush, quickdraw | **win** | 2:36 | 145 decisions (56.1/min), reaction p50 0.5 s / p90 0.5 s, kept 57.5%, $0 |
| 3 | basesWorkers16x16-WorkerRush-mu2jtzn4 | script:rush, quickdraw | **win** | 2:24 | 135 decisions (56.9/min), reaction p50 0.5 s / p90 0.5 s, kept 60.7%, $0 |
| 4 | basesWorkers16x16-WorkerRush-mu2jx1of | script:rush, quickdraw | **win** | 2:24 | 140 decisions (58/min), reaction p50 0.5 s / p90 0.5 s, kept 62.4%, $0 |
| 5 | basesWorkers16x16-WorkerRush-mu2k05k9 | script:rush, quickdraw | **win** | 2:36 | 156 decisions (60.4/min), reaction p50 0.4 s / p90 0.5 s, kept 61.4%, $0 |
| 6 | basesWorkers16x16-WorkerRush-mu346lqi | script:rush, quickdraw | **win** | 3:54 | campaign 1/5: 229 decisions (58.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 61.1%, 165 rejected, cache null%, $0 |
| 7 | basesWorkers16x16-WorkerRush-mu34br82 | script:rush, quickdraw | **win** | 2:48 | campaign 2/5: 174 decisions (62.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 55.8%, 146 rejected, cache null%, $0 |
| 8 | basesWorkers16x16-WorkerRush-mu34fg74 | script:rush, quickdraw | loss | 2:54 | campaign 3/5: 166 decisions (58.1/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 53.8%, 160 rejected, cache null%, $0 |
| 9 | basesWorkers16x16-WorkerRush-mu34j8np | script:rush, quickdraw | loss | 2:36 | campaign 4/5: 148 decisions (56.9/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 56%, 116 rejected, cache null%, $0 |
| 10 | basesWorkers16x16-WorkerRush-mu34mp5b | script:rush, quickdraw | loss | 0:54 | campaign 5/5: 44 decisions (48.4/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 62.9%, 22 rejected, cache null%, $0 |
| 11 | basesWorkers16x16-WorkerRush-mu35721h | script:rush, quickdraw | **win** | 1:30 | campaign 1/5: 89 decisions (57.7/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 54.3%, 23 rejected, cache null%, $0 |
| 12 | basesWorkers16x16-WorkerRush-mu3595j6 | script:rush, quickdraw | **win** | 1:42 | campaign 2/5: 98 decisions (57.1/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 54.4%, 25 rejected, cache null%, $0 |
| 13 | basesWorkers16x16-WorkerRush-mu35bh6d | script:rush, quickdraw | **win** | 1:30 | campaign 3/5: 87 decisions (56.2/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 53.9%, 19 rejected, cache null%, $0 |
| 14 | basesWorkers16x16-WorkerRush-mu35dkxf | script:rush, quickdraw | **win** | 2:00 | campaign 4/5: 108 decisions (55.4/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 54.2%, 30 rejected, cache null%, $0 |
| 15 | basesWorkers16x16-WorkerRush-mu35g7bd | script:rush, quickdraw | **win** | 1:36 | campaign 5/5: 89 decisions (54.2/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 52.7%, 22 rejected, cache null%, $0 |
| 16 | basesWorkers16x16-WorkerRush-mu35s4kh | claude-sonnet-5, quickdraw | loss | 0:42 | model 1: plain: 17 decisions (22.9/min), reaction p50 3.1 s / p90 5.6 s (wait 0.8 s), model p50 2.1 s, 47 out tokens, packet 490 real, 0 timeouts, kept 39.4%, 4 rejected, cache 100% (2821 written), $0.0403 |
| 17 | basesWorkers16x16-WorkerRush-mu35upxg | claude-sonnet-5, quickdraw | loss | 0:42 | model 2: --overlap 2 --event-tick: 25 decisions (34.8/min), reaction p50 3.1 s / p90 4.6 s (wait 0.2 s), model p50 2.1 s, 46 out tokens, packet 480 real, 1 timeouts, 21 overlapped, kept 30.4%, 9 rejected, cache 100%, $0.0494 |
| 18 | basesWorkers16x16-WorkerRush-mu35uul3 | claude-sonnet-5, quickdraw | **win** | 6:06 | model 3: --microrts-cycle-ms 300 (latency-free diagnostic): 135 decisions (22.1/min), reaction p50 3.9 s / p90 5.4 s (wait 0.7 s), model p50 2.2 s, 54 out tokens, packet 545 real, 2 timeouts, kept 41.1%, 71 rejected, cache 100%, $0.2998 |
| 19 | basesWorkers16x16-WorkerRush-mu363izf | claude-sonnet-5, quickdraw | loss | 0:42 | model 4: --thinking off --overlap 2 --event-tick: 24 decisions (35.1/min), reaction p50 3.1 s / p90 4.4 s (wait 0 s), model p50 2.2 s, 50 out tokens, packet 495 real, 0 timeouts, 20 overlapped, kept 42.6%, 6 rejected, cache 95.7% (5642 written), $0.0616 |
| 20 | basesWorkers16x16-WorkerRush-mu363mff | claude-sonnet-5, quickdraw | loss | 0:48 | model 5: --effort low --overlap 2 --event-tick: 32 decisions (38.7/min), reaction p50 2.2 s / p90 3.3 s (wait 0 s), model p50 2 s, 48 out tokens, packet 505 real, 1 timeouts, 29 overlapped, kept 37.3%, 15 rejected, cache 100%, $0.0649 |
| 21 | basesWorkers16x16-WorkerRush-mu4a1wcj | claude-sonnet-5, quickdraw | **win** | 6:30 | campaign 1/3: 116 decisions (17.7/min), reaction p50 5.4 s / p90 7.5 s (wait 1.6 s), model p50 2.8 s, 122 out tokens, packet 585 real, 0 timeouts, kept 39.3%, 81 rejected, cache 100%, $0.3503 |
| 22 | basesWorkers16x16-WorkerRush-mu4aaf6x | claude-sonnet-5, quickdraw | loss | 2:12 | campaign 2/3: 42 decisions (19.1/min), reaction p50 4.8 s / p90 6.3 s (wait 0.2 s), model p50 2.4 s, 104 out tokens, packet 510 real, 0 timeouts, kept 38.6%, 12 rejected, cache 100%, $0.1122 |
| 23 | basesWorkers16x16-WorkerRush-mu4add1e | claude-sonnet-5, quickdraw | loss | 3:00 | campaign 3/3: 54 decisions (18/min), reaction p50 4.8 s / p90 6 s (wait 0.6 s), model p50 2.5 s, 104 out tokens, packet 529 real, 0 timeouts, kept 41.5%, 12 rejected, cache 100%, $0.1476 |
| 24 | basesWorkers16x16-WorkerRush-mu4ah87z | claude-sonnet-5, quickdraw | loss | 2:42 | campaign 1/2: 53 decisions (19.8/min), reaction p50 5.1 s / p90 6 s (wait 0.1 s), model p50 2.3 s, 44 out tokens, packet 460 real, 0 timeouts, kept 45.6%, 7 rejected, cache 100% (2821 written), $0.11 |
| 25 | basesWorkers16x16-WorkerRush-mu4aks2u | claude-sonnet-5, quickdraw | loss | 2:00 | campaign 2/2: 40 decisions (20/min), reaction p50 3.9 s / p90 4.5 s (wait 0 s), model p50 2.1 s, 46 out tokens, packet 468 real, 0 timeouts, kept 40.6%, 10 rejected, cache 100%, $0.0777 |
| 26 | basesWorkers16x16-WorkerRush-mu4fki7q | claude-sonnet-5, quickdraw | loss | 2:42 | campaign 1/3: 54 decisions (20/min), reaction p50 4.5 s / p90 5.4 s (wait 0.3 s), model p50 2.6 s, 149 out tokens, packet 854 real, 0 timeouts, kept 31.3%, 15 rejected, cache 100% (3718 written), $0.2149 |
| 27 | basesWorkers16x16-WorkerRush-mu4fo38c | claude-sonnet-5, quickdraw | loss | 2:36 | campaign 2/3: 54 decisions (20.4/min), reaction p50 3.9 s / p90 5.4 s (wait 0.2 s), model p50 2.4 s, 136 out tokens, packet 819 real, 0 timeouts, kept 23.1%, 10 rejected, cache 100%, $0.1972 |
| 28 | basesWorkers16x16-WorkerRush-mu4frlxk | claude-sonnet-5, quickdraw | loss | 3:00 | campaign 3/3: 57 decisions (19.2/min), reaction p50 4.2 s / p90 6 s (wait 0.6 s), model p50 2.6 s, 144 out tokens, packet 899 real, 2 timeouts, kept 37.1%, 17 rejected, cache 100%, $0.2194 |

**Campaign 1 (`script:rush` vs `ai.abstraction.WorkerRush`, 2026-09-15): 5 of 5**, every game 2:24–2:36, 55–60
decisions a minute, reaction p50 0.4–0.5 s (one `refreshMs`: the floor for a 500 ms state cadence), $0.

**Fidelity (oracle v3): 34% of the 716 decisions survive the packet, 28% exact, zero read errors on either side**
(`bin/oracle.mjs runs/mrts/*.jsonl --policy rush`). v1 read 100%, but its state side mirrored the encoder's shaping; v2/v3
read the full state — every unit and every enemy its own entry with its own state and cell — so the A and X folds are
measured too. Per-layer ablation against the unshaped view: A costs 456 decisions, X 71 (12 of the 18 X losses are a
raid inside DEFEND whose cluster centroid sat outside it), B/P/E 0, budget and cadence 0. **`--microrts-split-states
true` (A never mixes states) lifts it to 58% same / 51% exact for +9 tokens a packet**; what remains is positional — the
same harvesters chosen, but a cluster centroid decides which idle worker sorts nearest or which node it gets. At
298 tokens (countTokens-calibrated, divisor 1.28, 2026-09-15) the packet is a cheap carrier of this plan, not a lossless one. Layer shares: enemy 29%, economy 17%, army 17%, last 15%,
buildings 7%, production 6%, the rest 9%. Economy and buildings are 98–100% repeats — the first thing to try cutting.

`kept` sits near 60% by design, not by accident. The 443 dropped orders are all `busy`: the plan re-offers `t … li 5`
and `t … wk 5` every decision, and validate refuses one aimed at a building with a produce already in flight, because
issuing over it cancels it and burns the resources. The 442 `wait` results are the same thing a level down — a standing
goal that could not be stepped that cycle and is still in the buffer. Neither is a lost order; `pace` counts both
against `kept` because it cannot tell a standing order from a failed one.

**Bench 8/8, trajectory rules** (`bin/bench.mjs --game microrts --model script:rush`, `bin/trajectory.mjs … --every 5`):
purchases agree 89% windowed, army 100%. Two rules under-score for reasons that are the rule's, not the plan's:
`noIdle` 3/17, because a unit holding a standing goal in the buffer is not re-named in that decision's orders and a
per-decision rule cannot see the buffer; `harvesters` 20/27, because the A layer collapses a cluster to one dominant
state, so two workers in `h` and `m` read as two harvesters. Oracle v2 prices that miss: it is the whole 64% of
decisions the packet loses (v2; 66% under v3 with X unfolded). `--diff` n=4: `wk x2@3,1 r` is one worker returning and one walking, so the packet counts
two harvesters and tops up neither; n=9: a worker producing the barracks hides inside an `h` cluster, so the packet
re-buys the barracks instead of a worker. One caveat: the rule that pays is the harvester top-up, which reads a
unit's engine action (`h`/`r`) rather than its standing order, so a harvester mid-walk reads `m` on the state side and
draws a third harvester; the oracle prices what the packet does not carry (per-unit state), not which side is right.

**Campaign 2 (`--microrts-split-states true`, 2026-09-15): 2 of 5** (games 6–10). Fidelity up, play down: first Light at
cycle 474 in every game against 434 in every game of campaign 1; harvester node swaps 49–84 a game against 12–32; 14–21
distinct workers ordered to harvest against 9–11. Game 10 lost its base at cycle 444 with the barracks idle at r2 for
90 cycles (`t 32 li 5` → `wait`: an enemy worker parked beside it, the defence attack-moved onto the same cells, and a
produce needs a free neighbour). Cause: the policy's harvester rule reads a unit's engine action, so a harvester walking
to its node is `m` and counts as free; under the fold two walkers shared a centroid and sorted by id, which kept the pair
stable by accident — per-unit positions flip the nearest-first sort every decision and the pair is reassigned mid-trip
(the game-1 lesson in `rush.mjs`, back). The oracle cannot see this: its state-side reference churns the same way, and
per-decision equivalence has no notion of a standing order across decisions. Fix on the adapter side: `goal` on each
unit from the standing-order buffer, rendered as the A state under `--microrts-goal-state` (campaign 3).

**Campaign 3 (`--microrts-split-states true --microrts-goal-state true`, 2026-09-15): 5 of 5** (games 11–15), every
game 1.5–1.9 min (914–1,165 cycles) against 2:24–2:36 in campaign 1 — the fastest MicroRTS games yet. `goal-state`
renders a unit's standing order from the buffer as its A state, so a harvester walking to its node reads `h` for the
whole trip: harvest orders a game 6–13 (campaign 1: 165–206; campaign 2: 178–348), node swaps 1 (12–32; 49–84), distinct
harvesters 2–4 (9–11; 14–21). Fidelity on these recordings: **89% same / 64% exact over 471 decisions** (A 49, X 29);
`--arm --microrts-goal-state false` on the same recordings reads 64%, so the flag itself is worth 25 points of fidelity
and the whole of the churn. First Light still 464–509 (campaign 1: 434) but the harvesters never drop ore, so the
defence holds and the push lands 500 cycles sooner. Both flags are the working config from here.

**Model games 16–20 (Sonnet, `prompts/microrts/game01-sonnet.md`, working packet flags, 2026-09-15): 1 of 5, and the
one win is the diagnostic.** At the real clock (100 ms a cycle) the model lost four games in 0:41–0:49, $0.04–0.06 each:
reaction p50 3.1 s (2.2 s with `--effort low`) is 22–31 cycles a decision, so the base starts its first worker at cycle
44–76 (script: 0), the barracks lands at 364–404 or never (script: 249), and the rush that arrives around cycle 320 kills
the builder or the base before a Light exists. API time is 2.0–2.2 s of that on every config — `--thinking off` and
`--overlap 2 --event-tick` do not move it, `--effort low` takes 0.9 s off the reaction and not enough off the opening.
Game 18 at `--microrts-cycle-ms 300` (13 cycles a decision) **won in 6:06 for $0.30** with the barracks at 280 and the
first Light at 452, inside the script's range: plan and packet carry the model once its latency is not the game clock.
The model's own share, from the trajectory rules: 3–6 harvesters where the plan says two (`harvesters` 6/14, 7/21,
12/110, 3/18, 9/29), the barracks builder re-tasked to harvest or move in games 17 and 19 (the buffer's one goal per
unit cancels the build), and no answer to the raid in game 17. Two phrasings the parser refused (`a all wk 2,4`, a hunt
with two ids) now parse (`lang.mjs`). Harness-side next: a scripted opening (`opening.mjs` exists for Ashfall) so the
first 250 cycles do not wait on a 3 s call, and a sticky build so an in-flight barracks survives a re-task.

**Memory (`--memory 200`, `game02-sonnet.md`, 300 ms a cycle, 2026-09-16): 1 of 3 (games 21–23) against 1 of 3 without it
(games 18, 24–25).** The model writes a note to itself in the tool's `n` field and reads it back as layer `N` on the next
packet (core, game-agnostic; docs/REQUIREMENTS.md M12). It did what it was built for: harvest orders per game 69/24/14 →
38/12/13, barracks builders 3/2/4 → 2/1/2, the builder never re-tasked mid-build, and the note read as a plan
(`#22,#25 harvesting. Base pumping workers to 6. Next free worker with 5+ banked builds barracks near 2,2`). It cost
what a note costs: the model rewrote it on every call (116/116, 93 distinct), output 44–54 → 104–122 tokens, model p50
2.1–2.3 → 2.4–2.8 s, reaction p50 3.9–5.1 → 4.8–5.4 s. It did not move the win rate, because all four losses are the same
in-decision failure: raiders on `X` at d ≤ 6 from cycle ~205 while the model keeps ordering `t 20 wk 5`, four harvesters
instead of two, the bank at 0–2 when the barracks finishes (255), so no Light ever comes and the base is dead by 360–470.
The defence rule was never in the note, and the note cannot fire a rule the decision does not apply. Memory removes
the forgetting; the rule-following is still the loss. Also fixed: a worker building a barracks read state `?` under
`--microrts-goal-state` (STATE had no `train`); it reads `p` now, so game 18 replays 127/138 and every later run 100%.

**History (`--journal 6 --log 60 --memory 300 --microrts-foe-events true --packet-max 900`, `game03-sonnet.md`, 300 ms a
cycle, 2026-09-16): 0 of 3 (games 26–28), $0.20–0.22 a game.** The harness now keeps what happened — `G` the game so far
(their production, contacts, losses, kills in 50-cycle buckets), `R` the last six decisions with their outcomes — and the
note is asked for plan / why / doing / expect. The scaffolding worked as a scaffold: every note kept the form, the
builder was tracked from order to barracks (games 26–27 one builder each), harvest orders 14/9/23, and the model wrote
what it saw. It lost the same way as 22–25: first raider at d ≤ 6 on `X` at t218/240/222, first attack order at
t293/never/260, base making workers throughout, barracks at 253/297/260 with the bank at 1–2, no Light. Game 26's `why`
said `no threats near (d>=5)` on three consecutive packets that showed a raider at d5, d4, d3; game 27's `expect` said
`br done soon` for twelve decisions with no cycle to check. Cost of the history: packet 819–899 real tokens (was ~530),
output 136–149 (note rewritten every call), model p50 2.4–2.6 s. Conclusion after six memory games: neither memory nor
history is the bottleneck against WorkerRush — the defence and the two-harvester rules are not applied inside the
decision that sees the trigger. Script with the same flags: win 1:44, 115/115 replayed, `G`/`R`/`N` skipped by the reader.

**Why memory did not help (probes on game 26's packets n=24–27, raider at d7/d6/d5/d4, ~$0.55 total).** Asked in text on
packet 26 the model describes N/G/R correctly ("N is my own note… G the harness's game log… R my recent decisions so I
can check if orders stuck"), quotes `wk#24 d5`, cites rule 5 and orders the attack. The same packet as the forced tool
call answers `-` and re-emits the previous note with `no threats near (d>=6)` patched to `(d>=5)`. Ablation, 8 samples
an arm (4 packets × 2): recorded 0/8 defend; N stripped 0/8 (`why: scattered but far`, `not urgent`); N reset to a
neutral note 0/8; effort high 0/8; `check:` field first 0/8 — it writes `nearest wk#24 d5, rule5 doesn't fire (d>2)`,
reading the harvesters' d ≤ 2 clause as the threshold; rule 5 rewritten (`two nearest workers hunt it, mining does not
excuse`) 0/8, and with N present the note still says `no threats near (d>=6)` on a packet showing d5; rewritten rule +
one line of text before the tool 2/8 (`d5 — under threshold ≤6, rule 5 fires` … or `d4 — just a lone worker, not an
aggressive push`); same without N 2/8. Reading: (1) the model knows what the memory is; (2) the loss is a judgement it
makes fresh each call from its priors about RTS games — a lone worker is not a raid, d6 is "borderline" — against a
rule it treats as advisory, and in the forced one-line tool mode it never states the check at all; (3) the note makes
this stickier, not better: `why` carries the previous verdict (`no threats near`) and the model inherits the verdict
and edits its number rather than re-deriving it — a conflict between rule and memory that the model itself wrote into
memory. Memory should carry facts and intent (ids, cycles, a checkable `expect`), never a conclusion.

**What the plan is.** Two harvesters, the base on workers to six, a barracks at three workers and five banked, then
Light forever; defend anything within six of the base (harvesters too inside two), attack at three Light. Written out in
`prompts/microrts/game01-sonnet.md` and implemented in `src/games/microrts/policy/rush.mjs`.

**What it loses to.** An earlier draft with `BR_AT = 5` lost 1 of 5: the barracks started around cycle 300 and the rush
arrived first. At `BR_AT = 3` the barracks is up by ~220 and the Lights carry the game. The remaining exposure is the
same one — a rush that reaches the base before the first Light — and the plan has no answer but the two or three workers
already standing at the post. Untested against `LightRush`, `HeavyRush`, `RangedRush` or `ai.coac.CoacAI`.

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

**What the plan is.** Two harvesters, the base on workers to six, a barracks at three workers and five banked, then
Light forever; defend anything within six of the base (harvesters too inside two), attack at three Light. Written out in
`prompts/microrts/game01-sonnet.md` and implemented in `src/games/microrts/policy/rush.mjs`.

**What it loses to.** An earlier draft with `BR_AT = 5` lost 1 of 5: the barracks started around cycle 300 and the rush
arrived first. At `BR_AT = 3` the barracks is up by ~220 and the Lights carry the game. The remaining exposure is the
same one — a rush that reaches the base before the first Light — and the plan has no answer but the two or three workers
already standing at the post. Untested against `LightRush`, `HeavyRush`, `RangedRush` or `ai.coac.CoacAI`.

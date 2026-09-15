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

**Campaign 1 (`script:rush` vs `ai.abstraction.WorkerRush`, 2026-09-15): 5 of 5**, every game 2:24–2:36, 55–60
decisions a minute, reaction p50 0.4–0.5 s (one `refreshMs`: the floor for a 500 ms state cadence), $0.

**Fidelity: 100% exact on all 716 decisions of all five runs, zero read errors on either side** (`bin/oracle.mjs
runs/mrts/*.jsonl --policy rush`). No layer's facts differ between the packet and the state it was encoded from, so at
~120 est tokens the packet is a lossless carrier of this plan. Layer shares: enemy 29%, economy 17%, army 17%, last 15%,
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
state, so two workers in `h` and `m` read as two harvesters.

**What the plan is.** Two harvesters, the base on workers to six, a barracks at three workers and five banked, then
Light forever; defend anything within six of the base (harvesters too inside two), attack at three Light. Written out in
`prompts/microrts/game01-sonnet.md` and implemented in `src/games/microrts/policy/rush.mjs`.

**What it loses to.** An earlier draft with `BR_AT = 5` lost 1 of 5: the barracks started around cycle 300 and the rush
arrived first. At `BR_AT = 3` the barracks is up by ~220 and the Lights carry the game. The remaining exposure is the
same one — a rush that reaches the base before the first Light — and the plan has no answer but the two or three workers
already standing at the post. Untested against `LightRush`, `HeavyRush`, `RangedRush` or `ai.coac.CoacAI`.

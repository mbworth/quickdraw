# MicroRTS

[MicroRTS](https://github.com/santiontanon/microrts), `basesWorkers16x16` vs the built-in scripted AIs. Game two, the
proof of X5. No fog, no key: the engine dials OUT to a TCP server the adapter opens, and `SocketAI` sets no socket
timeout, so the adapter's reply delay (`--microrts-cycle-ms`) is the game's clock. Needs a local clone with
`src/games/microrts/remote-game-utt.patch` applied and rebuilt (`javac -cp "lib/*:lib/bots/*"`); stock CLIENT mode
builds two `UnitTypeTable`s and compares unit types by identity, so no produce ever lands without it.

## Run

```
git clone https://github.com/santiontanon/microrts ../microrts && cd ../microrts \
  && git apply ../quickdraw/src/games/microrts/remote-game-utt.patch \
  && javac -d bin -cp "lib/*:lib/bots/*" $(find src -name '*.java')
MICRORTS_LOCAL=../microrts npm run test:microrts               # real engine: 300-cycle game, pilot+pace+replay+layers
MICRORTS_LOCAL=../microrts node bin/pilot.mjs --game microrts --model script:rush \
  --microrts-opponent ai.abstraction.WorkerRush --microrts-split-states true --microrts-goal-state true   # the working config, $0 (campaign 3: 5/5, 1.5–1.9 min)
node bin/oracle.mjs runs/mrts/*.jsonl --policy rush; node bin/bench.mjs --game microrts --model script:rush
node bin/trajectory.mjs runs/mrts/<id>.jsonl --every 5 --model script:rush
```

## Flags (`--microrts-*`)

`-local <dir>` (or `MICRORTS_LOCAL`) clone path. `-map` default `maps/16x16/basesWorkers16x16.xml`. `-opponent`
default `ai.abstraction.WorkerRush`. `-cycle-ms` default 100 — the adapter's reply delay and the game's clock.
`-max-cycles` default 3000 (five real minutes). `-port` default 9898, 0 = ephemeral. `-spawn true|false` — false waits
for an externally started engine. `-order-cap` default 10. No `-lang` flag: orders are always the order language.
`-split-states true` (default false) — A clusters by type AND state, so a mixed-state cluster (one harvesting, one
walking) never reads as all-one-state. Oracle v2, arm: 36%→63% same-decision / 31%→55% exact over the 716 recorded
decisions (`--arm --microrts-split-states true`); +8.6 tokens/packet mean over the 24 fixtures (298→306, divisor
1.28); bench 8/8 either way.

`-goal-state true` (default false) — A's per-unit state renders the standing buffer goal (harvest/move/attack) instead
of the engine's mid-step action, so a harvester walking to its node reads `h` not `m`. `goal` itself is always on the
state (index.mjs); the flag only changes what coder.mjs renders. Aimed at the split-states churn: `mining` (rush.mjs)
reads workers in state `h`/`r` as already harvesting, and a walking-to-node harvester read `m` (engine action) instead,
so it got re-topped-up by nearest node every decision (49–84 node swaps/game vs 12–32 without split-states;
notes/microrts/games.md).

`--model commander:rush` — the commander split: `policy/rush.mjs` answers every packet at 0 ms from a parameter set
(`harvesters, workers, barracksAt, defend, panic, pushLight, pushWorkers, post, target`, defaults 2/6/3/6/2/3/6/1/null,
see the rule comments 1-7 in rush.mjs), while `policy/commander.mjs` runs an API model on its own clock in the
background and returns the next parameter set plus a note (`prompts/microrts/commander01-sonnet.md`); `apply()`
clamps the model's answer and falls back to the previous value field by field, so a bad tool call never breaks the
reflex.

Core flag `--memory <chars>` (default 0, off): the model writes a note to itself in the tool's `n` field and reads it back on
the next packet as layer `N` (prompt game02). Game-agnostic; see docs/REQUIREMENTS.md M12. Core `--journal N` / `--log N`
(default 0): the harness hands the last N decisions and the last N game triggers to encode, rendered here as `R` (recent
decisions: cycle, what woke it | orders and results) and `G` (the game so far in 50-cycle buckets); `-foe-events true`
adds `foe wk#28@13,14` events so `G` shows the opponent's production (M13; prompt game03, `--packet-max 900`).

## Packet

One `*Facts` function and one renderer per layer, so `read.mjs`/`facts.mjs` cannot drift. Example
(`test/games/microrts/golden/midgame.txt`):

```
H t384 r7 u5/5
A wk x3@3,1 m #22,#27,#36
X wk x2@5,9 d10/6 #30,#32
```

Layers: `H D T P E A B X L`. Vocabulary from `abbr.mjs`. 298 tokens on 16×16 (countTokens-calibrated, divisor 1.28, 2026-09-15; target was 400).

## Orders

One string, decoded by `lang.mjs`: `t <bldId> <unit> [n]` produce (a Worker can produce Base/Barracks), `h <units>
[nodeId]` harvest, `m <units> <x,y>` move, `a <units> <x,y>|<unitId>` attack-move or hunt, `-` nothing. `<units>` is
ids, a selector (`all idle wk li hv rg`) or a cluster label from `A`. An order is a standing goal (no wire queue), so
`train count` does not fan out — the count stays on the goal. Validate mirrors `issueSafe`: drops a producer with an
in-flight produce (issuing over it cancels and burns resources), an unaffordable produce, a producer boxed in, a
move/attack-move off the map or at a wall.

## Scripted policy

`policy/rush.mjs`: two harvesters, base makes workers to six, barracks at three workers/five ore, then Light forever;
defend within 6 of base (harvesters within 2), attack at three Light. 5/5 vs `WorkerRush`, $0
(`prompts/microrts/game01-sonnet.md`).

## Commander (2026-09-17)

`--model commander:rush`: the script plays every packet at 0 ms; the model sets its parameters, a one-line `plan` and a gradable
`expect` every few seconds, and `F` hands back what the last set did and how the plan graded. Prompts: `commander01` (levers),
`02` (cause/effect per lever + F), `03` (unit table, counters, timings, openings), `04` (03 + a think-hard prod, no effect),
`05` (03 + graded plan, no prescribed response; current). Aim and findings: `HANDOFF.md` "Current aim"; per-game log: `games.md`.
Record vs CoacAI: 0 wins in 15 valid commander games (62–87); best game Fable 5.1 on a 400 ms clock (game 87: 5 Heavies, their base to 6 hp, loss t1301).
Fable needs `--commander-model claude-fable-5-1 --decision-deadline 30000` and a slower `--microrts-cycle-ms` (its calls take 15–20 s).

## Scoreboard (2026-09-15)

Fidelity (oracle v3, the state side unshaped) 34% decision-equivalent / 28% exact, 716 decisions/5 runs, 0 read errors,
the loss A's one-state-per-cluster fold (456) and X's centroid (71); **89% / 64% over 471 decisions on the working config (`--microrts-split-states --microrts-goal-state`, campaign 3, 5/5 in 1.5–1.9 min)** (`bin/oracle.mjs`); 298 tokens/packet (countTokens-calibrated, divisor 1.28, 2026-09-15); reaction p50
0.4–0.5 s (one `refreshMs`, the floor for a 500 ms cadence); win rate 5/5 vs `WorkerRush` with the script; **Sonnet 1/5
(games 16–20): 0/4 at 100 ms a cycle, reaction p50 2.2–3.1 s = 22–31 cycles a decision loses the opening; the win is at
300 ms a cycle, 6:06, $0.30**; with `--memory 200` (games 21–23) 1/3 vs 1/3 without (18, 24–25): churn down, win rate flat; with `--journal 6 --log 60` and a facts-only note (games 32–34, history ranked below the board) 1/3 — the losses are the defence rule not applied in-decision; **commander split (`--model commander:rush`, games 35–37) 3/3 at the real 100 ms clock, 1:18–1:48, $0.08–0.10** (`games.md`); core diff `git diff
src/core` empty (X5 met).

## Known quirks / open

The engine bug + patch: stock CLIENT mode builds two type tables and compares unit types by identity, freezing every
producer. `busy` excludes `TYPE_NONE` (`fillWithNones` hides real idleness). The engine allows one unit per
destination cell, cancelling a second across cycles. An attack-move at an occupied cell (their base) stops one step
short rather than completing. `bin/campaign.mjs` now counts a draw (`max_cycles`) as decided. Script baseline (games 38–49, 100 ms): `LightRush` 1/3, `HeavyRush` 0/3, `RangedRush` 2/3, `ai.coac.CoacAI` 0/3; with `train` `hv` or `li,rg` (games 50–61) HeavyRush 1/3, CoacAI 0/3; model games in `games.md` (16–20).

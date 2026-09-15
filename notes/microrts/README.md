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
  --microrts-opponent ai.abstraction.WorkerRush   # the working config, $0
node bin/oracle.mjs runs/mrts/*.jsonl --policy rush; node bin/bench.mjs --game microrts --model script:rush
node bin/trajectory.mjs runs/mrts/<id>.jsonl --every 5 --model script:rush
```

## Flags (`--microrts-*`)

`-local <dir>` (or `MICRORTS_LOCAL`) clone path. `-map` default `maps/16x16/basesWorkers16x16.xml`. `-opponent`
default `ai.abstraction.WorkerRush`. `-cycle-ms` default 100 — the adapter's reply delay and the game's clock.
`-max-cycles` default 3000 (five real minutes). `-port` default 9898, 0 = ephemeral. `-spawn true|false` — false waits
for an externally started engine. `-order-cap` default 10. No `-lang` flag: orders are always the order language.

## Packet

One `*Facts` function and one renderer per layer, so `read.mjs`/`facts.mjs` cannot drift. Example
(`test/games/microrts/golden/midgame.txt`):

```
H t384 r7 u5/5
A wk x3@3,1 m #22,#27,#36
X wk x2@5,9 d10/6 #30,#32
```

Layers: `H D T P E A B X L`. Vocabulary from `abbr.mjs`. ~120 est tokens on 16×16 (target was 400).

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

## Scoreboard (2026-09-15)

Fidelity 100% exact, 716 decisions/5 runs, 0 read errors (`bin/oracle.mjs`); ~120 est tokens/packet; reaction p50
0.4–0.5 s (one `refreshMs`, the floor for a 500 ms cadence); win rate 5/5 vs `WorkerRush`; core diff `git diff
src/core` empty (X5 met).

## Known quirks / open

The engine bug + patch: stock CLIENT mode builds two type tables and compares unit types by identity, freezing every
producer. `busy` excludes `TYPE_NONE` (`fillWithNones` hides real idleness). The engine allows one unit per
destination cell, cancelling a second across cycles. An attack-move at an occupied cell (their base) stops one step
short rather than completing. `bin/campaign.mjs` now counts a draw (`max_cycles`) as decided. The token divisor is
still the 3.5 placeholder, uncalibrated. Untested: `LightRush`, `HeavyRush`, `RangedRush`, `ai.coac.CoacAI`; no model
game played yet (Sonnet-only key, MicroRTS has run at $0 so far).

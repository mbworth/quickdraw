# Ashfall Sector

RTS with an MCP and WebSocket interface (`play.ashfallsector.com`). Game one. Client only — what a human at the screen
could know: `src/games/ashfall/` opens `wss://<host>/ctl` directly (no MCP, no sim/store), keyed (`ASHFALL_KEY`) or
open on a local hub. Protocol facts: `docs/REQUIREMENTS.md` §9.

## Run

```
npm test                                                       # adapter unit + golden + property tests
ASHFALL_LOCAL=../ashfall_sector npm run test:ashfall           # local hub integration
ASHFALL_LOCAL=../ashfall_sector node bin/record.mjs --game ashfall --seconds 240   # fixtures
node bin/pilot.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game55-sonnet.md \
  --packet-max 1000 --full-every 5 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true \
  --ashfall-compact-buildings true --ashfall-keep-remembered true --ashfall-lang true --ashfall-search-fields true \
  --ashfall-guide true --ashfall-plan-marks true --overlap 2 --event-tick --stream --max-usd 2 \
  --concede-on budget --stop-file /tmp/qd-stop --ashfall-concede-stale true   # working config, live
node bin/pilot.mjs --game ashfall --model script:game38 --ashfall-lang true --ashfall-guide true …   # the plan as code, $0
node bin/pace.mjs runs/ashfall-<id>.jsonl; node bin/bench.mjs …; node bin/oracle.mjs runs/ashfall-*.jsonl
```

## Flags (`--ashfall-*`)

`-size -opponent -game -team -open -host` seat/connect. `-fold-fields` unexplored fields onto one `f?` line.
`-fields-on-demand` `F` on every packet while a harvester is idle or dry. `-no-note` schema without `note`.
`-compact-buildings` all buildings on one always-on `B` line (ids, types, anchor positions, hp only when hurt). `-keep-remembered` `M` every packet at army priority. `-lang` order
language (`game25-sonnet.md`+). `-search-fields` search waypoint on `M` (`game32-sonnet.md`+). `-guide` counts on `H`,
`post@`/`yard@`/`(no tu)` on `B`, mirror-first waypoint (`game38-sonnet.md`). `-plan-marks` (with guide) `out
failed`/`(2nd ba)` marks (`game55-sonnet.md`). `-order-cap N` orders per decision. `-concede-stale` concede and leave any unfinished seat found at startup.

## Packet

Fixed order, integers only, vocabulary from `abbr.mjs`. Example (`test/games/ashfall/golden/opening.txt`):

```
H t0:00 o150 c0 s4/10
A wk x4@63,4 g
F f1 home ore@61,13 o2500 live n#1,#2,#3,#4,#5
```

Layers: `H D T P E A B X M F L`. ~420–470 real tokens at the working config (game 55: 463); 720 with `--full-every 1`
and no compaction.

## Orders

`t <bld> <type> [n]` train, `b <type> <x,z> [harv]` build, `m/am <units> <x,z>` move/attack-move, `a <units> <enemy>`
attack, `s <units>` stop, `g <harv> [node]` gather, `r <harv> <target>` repair, `rs <bld> <key>` research,
`ry <bld> <x,z>|-` rally, `c <bld>` cancel, `d <units>` disband. `;`-separated; units are ids, selectors (`all army
idle workers troopers raiders wardens siege`) or a cluster label from `A`. `train count` fans out, clamped to
`5 − queue.length`; a repeat this decision or still-pending is dropped. Validate drops `attack` off `X`, `train` when
`CAPPED`/short, `build` when ore short.

## Scripted policy

`policy/game38.mjs`: harvester-first economy, barracks early, commit with 15 riflemen once a turret is up, retreat
from a dug-in cluster as big as mine. Script 10/11 live (games 39–49, $0); Sonnet, same prompt, 4/5 (games 50–54,
$6.90).

## Prompts

Current: `prompts/ashfall/game55-sonnet.md` (`--ashfall-guide --ashfall-plan-marks`). Flag-gated older: `game25`
(order language), `game32` (search waypoint), `game38` (guide).

## Scoreboard (2026-09-15)

Fidelity 100% (5,958 decisions, 18 runs, `bin/oracle.mjs`); tokens/packet ~430–460; reaction floor with the script
0 s p50; win rate script 10/11, Sonnet 4/5; core diff n/a (game one — see MicroRTS, X5).

## Known quirks / open

Guide fields exist because the model skips an absence check unless stated outright. Plan marks lift two bench misses
offline but have not fired live. The hub stuttered 2026-09-14, lengthening the model's games (request filed with
`ashfall`); unconfirmed against the model's own dribbling. Small: `L` prints old wording, not order language.

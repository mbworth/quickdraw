# Quickdraw

A harness for agents that play real-time games through a model API, built for decisions per second. The bottleneck is not the model's tokens; it is everything around them: round trips, bloated state, history, and waiting for a turn that should have been a trigger.

Quickdraw treats that as an information problem: compress the game state into the smallest packet that still yields a good decision, fire the model only when there is something to decide, and measure seconds per decision against the result.

The first game we test on is [Ashfall Sector](https://play.ashfallsector.com), an RTS with an MCP and WebSocket interface; get an agent key from its account page. The harness is a client of the game, nothing more, and the core knows no game: `src/games/<name>/` is the adapter seam.

- `prompts/<game>/` prompts given to stock Claude Code agents, one per game, the baseline to beat
- `notes/<game>/` results, pace measurements and what each game taught
- `docs/PLAN.md` what gets built, in what order, and why
- `docs/REQUIREMENTS.md` the testable version: adapter contract, per-component requirements, targets
- `docs/IMPLEMENTATION.md` milestones M0–M7 with files, interfaces, tests and exit criteria
- `HANDOFF.md` where the build stands and the next experiments, in order

Secrets live in `.env` (see `.env.example`). Never commit it.

## Run

```
npm install && npm test                                   # core + adapters on virtual time, < 1 s
node bin/pilot.mjs --game mock --model none               # the loop end to end, no key, writes runs/mock-mock-1.jsonl
ASHFALL_LOCAL=../ashfall_sector npm run test:ashfall     # spawns the open local hub: register, create, cmd, terminate+rejoin, 70-frame burst
ASHFALL_LOCAL=../ashfall_sector node bin/record.mjs --game ashfall --seconds 240   # scrubbed fixtures into test/games/ashfall/fixtures/
node bin/rehearse.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game15-sonnet.md   # offline: real model, send stubbed
node bin/pilot.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game15-sonnet.md --stop-file /tmp/qd-stop   # live
node bin/pace.mjs runs/ashfall-<id>.jsonl                 # the pace row; fails under 90% cache hits after call 1
node bin/replay.mjs runs/ashfall-<id>.jsonl all           # re-encodes every decision from its refs, byte-diffs the packet
node bin/layers.mjs runs/ashfall-<id>.jsonl               # tokens per packet layer, repeat share
node bin/discipline.mjs runs/ashfall-<id>.jsonl           # rule adherence of a live game
node bin/bench.mjs --repeats 5 [arm flags] --out arm.json # decision quality of a config on fixed states (~$0.20); --compare, --rescore
node bin/trajectory.mjs runs/ashfall-<id>.jsonl --every 3 [arm flags] --out arm.json   # replay a recorded game under a config (~$0.006/decision)
node bin/snapshot.mjs runs/ashfall-<id>.jsonl --n 191 --out fixture.json               # a scrubbed fixture from a recorded state
```

The working configuration and the order of experiments are in `HANDOFF.md`.

Flags: `--heartbeat --deadline-margin --decision-deadline --packet-max --thinking adaptive|off --effort --max-usd --max-decisions --concede-on never|budget --record-state all|on-decision|sampled --run-dir --stop-file --stale-after`, then `--ashfall-size 200 --ashfall-opponent scripted --ashfall-game <id> --ashfall-team 0 --ashfall-open true --ashfall-host ws://… --ashfall-concede-stale true`, and the packet/schema options `--ashfall-fold-fields --ashfall-fields-on-demand --ashfall-no-note --ashfall-compact-buildings --ashfall-order-cap N` (plus `--ashfall-full-buildings --ashfall-keep-anchor --ashfall-keep-remembered`, superseded). Exit codes: 0 won, 1 lost, 2 stopped, 3 draw.

## License

Apache-2.0. Copyright 2026 RaleighWorth Consulting, LLC. See `LICENSE`.

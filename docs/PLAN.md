# Quickdraw plan

The measure is **seconds per decision** at equal or better win rate. Baseline: a stock Claude Code agent on the live Ashfall hub decides every 16 to 27 s (games 10 and 11). Of that, ~2 s is the MCP client per call, 6 to 9 s is the model reading a 3.6k-character state with its whole history behind it, and the rest is a `wait` the model picked because nothing told it when to look again.

## Decisions

1. **Transport: raw `/ctl` WebSocket** with an agent key (`Authorization: Bearer ash_…`). The hub pushes `state` every 500 ms and `event` as they happen; orders go out as `cmd{id,cmd,args}` and are answered by `result`. No polling, no MCP text meant for Claude Code, 0.2 s network. MCP stays the fallback for stock agents.
2. **Loop: Node, Anthropic Messages API, tool use, thinking off.** One process per seat. Each call is system prompt + the current packet + one tool (`orders`, a batch). No conversation history: the packet carries what matters from the past (recent events, last orders and whether they took). Node because the hub and the coder share JSON and the `/ctl` client is ~20 lines with `ws`.
3. **Information: the packet.** Three layers, each measured in tokens and in decision quality:
   - *Coded state*: bank, supply, production queues, units by type × position bucket, enemies in vision, threats, remembered enemy buildings, fields. Fixed field order, abbreviations, integers. Target ≤ 600 tokens.
   - *Delta*: what changed since the last packet (new contacts, losses, idle, finished builds). The model reads the delta first, the coded state when it needs to.
   - *Ranked events*: the event stream scored by urgency (under fire > contact > idle > economy), top N only.
   The experiment: shrink the packet until decisions degrade, then stop one step back.
4. **Cadence: triggers, not waits.** The model never chooses when to look. The loop fires on an event class (contact, under fire, building done, production idle), on bank crossing the cheapest useful purchase, or on a heartbeat (3 s). Back-to-back triggers coalesce while a call is in flight; a call in flight when the world changes gets its orders checked against the new state before they are sent (drop an order whose target is gone).

## Phases

1. **Client** (`src/ctl.mjs`): connect, seat (`create`/`join`), keep `state` and `event` in memory, `cmd` with correlation ids, reconnect. Test against a local open hub from the game repo.
2. **Coder** (`src/packet.mjs`): ctl state → coded state, delta, ranked events. Print token counts. Golden tests on recorded states.
3. **Loop** (`src/pilot.mjs`): triggers, Messages API call, tool result → `cmd`s, coalescing. Record every packet, decision and latency to `runs/<game>.jsonl`.
4. **Measure** (`bin/pace.mjs`): seconds per decision, tokens per packet, orders per call, result. Compare to `notes/games.md` baselines.
5. **Iterate**: packet size, trigger classes, model (sonnet vs haiku vs opus), prompt. One variable per game.

## Rules
- Client only; nothing the game's own client does not show.
- Strategy belongs in the system prompt and is versioned with the game in `prompts/`.
- Hub-side quality of life the pilot needs (terser state, wake on affordability, standing train orders) is requested from the game repo through ask-dev (`ashfall`) and stays within its fairness rule.

## Open
- Model and cost per game: a 3 s heartbeat is ~200 calls per 10-minute game; packet size sets the bill.
- Whether the delta alone suffices mid-game, with the full coded state every Nth call.
- Multi-seat (two pilots, one game) for self-play once a single pilot beats the scripted AI reliably.

# Quickdraw

A harness for agents that play real-time games through a model API, built for decisions per second. The bottleneck is not the model's tokens; it is everything around them: round trips, bloated state, history, and waiting for a turn that should have been a trigger.

Quickdraw treats that as an information problem: compress the game state into the smallest packet that still yields a good decision, fire the model only when there is something to decide, and measure seconds per decision against the result.

First game: [Ashfall Sector](https://play.ashfallsector.com), an RTS with an MCP and WebSocket interface. The harness is a client of the game, nothing more.

- `prompts/` prompts given to stock Claude Code agents, one per game, the baseline to beat
- `notes/` results, pace measurements and what each game taught
- `docs/PLAN.md` what gets built, in what order, and why

Secrets live in `.env` (see `.env.example`). Never commit it.

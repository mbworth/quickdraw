# Quickdraw — agent notes

Goal: shortest time from game state to a good order. Measure everything in seconds per decision and tokens per packet.

- **Client only.** Quickdraw knows what a human at the game's screen could know, nothing more. For Ashfall that means `/mcp` or `/ctl` with an agent key; never its sim or store.
- **Public repo.** No keys, private hosts, account or player ids in tracked files; the game's public play host is fine. Game strategy is fine here.
- **One game, one prompt, one note.** `prompts/<game>/gameNN-<model>.md` plus a line in `notes/<game>/games.md`: result, game id, pace, lessons.
- Commit and push only when asked. `.env` is gitignored.

When testing, we should prioritize optimize test efficiency and lowest api cost of harness testing. Seek to test using Opus or lower agents where possible.

# Quickdraw — agent notes

Goal: shortest time from game state to a good order. Measure everything in seconds per decision and tokens per packet.

- **Client only.** Quickdraw knows what a human at the game's screen could know, nothing more. For Ashfall that means `/mcp` or `/ctl` with an agent key; never its sim or store.
- **Public repo.** No keys, hosts or account ids in tracked files. Game strategy is fine here.
- **One game, one prompt, one note.** `prompts/gameNN-<model>.md` plus a line in `notes/games.md`: result, game id, pace, lessons.
- Commit and push only when asked. `.env` is gitignored.

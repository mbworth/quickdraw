# Ashfall Sector vs the scripted AI

Live hub, 200 map unless noted. Prompt for each game is in `prompts/` from game 10 on; earlier prompts lived in chat.

| game | id | model | result | time | notes |
|---|---|---|---|---|---|
| 1-3 | 13, 14, - | opus | loss | | first attempts, one stopped |
| 4 | 16 | opus | win | 9.6 min | economy first, turrets + dug-in riflemen, counter after the biggest wave |
| 5 | | opus | loss | | |
| 6 | | sonnet | loss | | |
| 7 | | sonnet | loss | | |
| 8 | | sonnet | win | | 400 map |
| 9 | | haiku | loss | | |
| 10 | 22 | sonnet | win | 10:00 | first one-call-per-turn prompt (`orders` ending in `wait`); 38 calls, 1 order/call, wait 15, gap 6 s |
| 11 | 23 | sonnet | win | 13.7 min | 30 calls, 2.5 orders/call, waits 10-15, gap 8.7 s; ~25 riflemen lost to guard-reflex chases around a barracks 17 from core; 0 crystal |

## Pace
Every Claude Code MCP call costs ~2 s client side (local stdio 1.7 s, live 2.1 s, network 0.2 s). Loop length = model gap + call + wait. Game 11 decided every 27 s.

## Opponent profile
Scout ~25 s, riflemen from ~90 s, waves of 6-9 every 15-40 s from ~3 min, from the map-centre side onto the nearest ore field, then parks ~11 from the core. Base is empty right after a wave fails.

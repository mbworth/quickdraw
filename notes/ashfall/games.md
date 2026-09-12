# Ashfall Sector vs the scripted AI

Live hub, 200 map unless noted. Prompt for each game is in `prompts/ashfall/` from game 10 on; earlier prompts lived in chat.

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
| 12 | 28 | sonnet, **quickdraw** | loss | 4.0 min | first pilot game: 77 decisions (19.4/min), reaction p50 4.0 s / p90 7.2 s, model p50 2.0 s, 116 output tokens, packet 660 real (481 est), cache 100% (prefix warm from the smoke run), $0.32; 43 orders sent, 97 dropped client-side (80 `noore`), 4 rejected; the AI's first riflemen (~1:30) killed harvesters one by one at the field while troopers rallied to them one at a time; never a turret, never 8 together |
| 13 | 29 | sonnet, quickdraw | stopped 10.1 min | | game 12 prompt after the review fixes: 214 decisions (21.2/min), reaction p50 3.8 s / p90 6.2 s (wait for the next state push 0.9 s of it), model p50 2.2 s, packet 718 real, 5 timeouts, kept 31.6%, $0.97; 0 reconnects, no pregame calls. Held the anchor with a growing ball and never attacked; stopped by hand |
| 14 | 30 | sonnet, quickdraw | stopped 16.1 min | | rule 3 → attack at 8 riflemen, win by killing the core: 250 decisions (15.5/min), model p50 2.7 s, **39 timeouts**, packet 737 real, kept 26.3%, $1.17. Ball of 27 shuttled between the anchor and a field 40 units out; never saw an enemy building ("map-centre side" is not a coordinate). 27-unit id lists in every move order drove output tokens and timeouts up |
| 15 | 31 | sonnet, quickdraw | **win** | 7.6 min | + enemy base = mirror of my core through 0,0; an unhurt ball keeps going: 147 decisions (19.3/min), reaction p50 4.9 s / p90 7.3 s (wait 1.6 s), model p50 2.6 s, packet 720 real, 7 timeouts, kept 44.3%, 2 rejected, $0.68. Ball of 11 crossed the centre at 6:00, core dead at 7:37 |

## Pace
Every Claude Code MCP call costs ~2 s client side (local stdio 1.7 s, live 2.1 s, network 0.2 s). Loop length = model gap + call + wait. Game 11 decided every 27 s.

Quickdraw (game 12, `bin/pace.mjs runs/ashfall-28.jsonl`): 19.4 decisions per game-minute, 8 of 85 calls timed out, reaction p50 4.0 s / p90 7.2 s (event arrival → last result, event-anchored decisions with orders, n=35), model p50 2.0 s, packet 660 real tokens p50 (481 est + framing; above the 600 target). The 2 s between model latency and reaction is queue time: 145 of 326 trigger outcomes waited for a call in flight, and an event waits for the next 500 ms state push. Calls 1 and 2 timed out at the 6 s deadline (cold cache write + strict schema compile); the first call now gets 3× the deadline. Orders kept 27.9%: the prompt's "spend everything" makes the model order purchases the bank cannot pay yet; validate drops them for free, but each is a wasted slot in the batch.

Games 13-15 (same harness, three prompts): the defend-only prompt never attacks; "attack the enemy base" without a coordinate walks in circles; the mirror rule wins. Harness lead from game 14: orders that list 27 ids cost output tokens and deadline timeouts; cluster labels or `army` should be the default selector.

## Opponent profile
Scout ~25 s, riflemen from ~90 s, waves of 6-9 every 15-40 s from ~3 min, from the map-centre side onto the nearest ore field, then parks ~11 from the core. Base is empty right after a wave fails.

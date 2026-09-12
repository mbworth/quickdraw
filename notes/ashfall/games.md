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
| 16 | 32 | sonnet, quickdraw | loss | 10:42 | **M7 ablation 1**: `--full-every 5` (fields + remembered on 1 packet in 5), prompt frozen: 171 decisions (15.9/min), reaction p50 4.7 s / p90 8.9 s (wait 1.4 s), model p50 2.5 s, 132 out tokens, **packet 467 real** (est 304; game 15: 720/583), 23 timeouts (12% vs 4.5%), kept 49.1%, 15 rejected, $0.72. Attacked at 8 riflemen (n=48, 3:00) and again in dribbles of 1-3; the ball traded away around 5-6 min, core died at 10:42. Timeouts sit in the fight (danger triggers, api p90 4.1 s vs 3.2 s), 18 of 23 on slim packets, in line with their 80% share. Rejections: `no units matched` 8, `no harvesters in selection` 5; drops: bad-id 17 (7 in game 15) |
| 17 | 33 | sonnet, quickdraw | **win** | 7:48 | **M7 ablation 2**: `--full-every 5 --ashfall-fold-fields true --ashfall-full-buildings true`, prompt frozen: 158 decisions (20.2/min), **reaction p50 3.9 s** / p90 7.1 s (wait 1.1 s), model p50 2.0 s, 129 out tokens, **packet 427 real** (est 273; slim packets ~250), 14 timeouts (11 of them in the final assault, n=144-158), kept 42.8%, 3 rejected, $0.66. Attacked with 9 at 3:50, reinforced in groups, core dead at 7:48. bad-id drops 15 (same as game 16), rejections back to game-15 level: the model finds its ids in P, A and L without B and F |
| 18 | 35 | sonnet, quickdraw | **win** | 5:48 | ablation 2 config, game 2 of 3: 112 decisions (19.4/min), reaction p50 3.9 s / p90 7.6 s (wait 1.1 s), model p50 2.1 s, 129 out tokens, packet 415 real (est 259), 12 timeouts (9 in the assault, n=91-105), kept 38.2%, 0 rejected, bad-id 9, $0.45. Ball of 5 pushed east at n=59; fastest win yet |
| 19 | 36 | sonnet, quickdraw | **win** | 13:00 | ablation 2 config, game 3 of 3: 251 decisions (19.4/min), reaction p50 4.0 s / p90 7.8 s (wait 1.3 s), model p50 2.1 s, 133 out tokens, packet 508 real (est 353), 23 timeouts, kept 38.7%, **40 rejected** (24 `no ore within 45 units`), $1.04. Home fields dry at ~8:30 with 11 idle harvesters; 22 of the 24 failed gathers were on slim packets, where the model had no node id and gathered blind. Won slowly on a starved economy |

## Pace
Every Claude Code MCP call costs ~2 s client side (local stdio 1.7 s, live 2.1 s, network 0.2 s). Loop length = model gap + call + wait. Game 11 decided every 27 s.

Quickdraw (game 12, `bin/pace.mjs runs/ashfall-28.jsonl`): 19.4 decisions per game-minute, 8 of 85 calls timed out, reaction p50 4.0 s / p90 7.2 s (event arrival → last result, event-anchored decisions with orders, n=35), model p50 2.0 s, packet 660 real tokens p50 (481 est + framing; above the 600 target). The 2 s between model latency and reaction is queue time: 145 of 326 trigger outcomes waited for a call in flight, and an event waits for the next 500 ms state push. Calls 1 and 2 timed out at the 6 s deadline (cold cache write + strict schema compile); the first call now gets 3× the deadline. Orders kept 27.9%: the prompt's "spend everything" makes the model order purchases the bank cannot pay yet; validate drops them for free, but each is a wasted slot in the batch.

Games 13-15 (same harness, three prompts): the defend-only prompt never attacks; "attack the enemy base" without a coordinate walks in circles; the mirror rule wins. Harness lead from game 14: orders that list 27 ids cost output tokens and deadline timeouts; cluster labels or `army` should be the default selector.

Game 16 (M7 ablation 1, `bin/layers.mjs`): with fields on 1 packet in 5 the packet fell from 720 to 467 real tokens; on slim packets buildings is now the largest repeated layer (66 tokens, 100% repeat), army the largest live one (54). Fields still costs ~300 tokens on the packets that carry it: 5 node ids per explored field.

Game 17 (ablation 2, fold + full buildings + every 5): packet 427 real, est 273, a win at the best reaction time so far (3.9 s p50). Real minus est is a steady ~150 tokens of message framing, now a third of the packet; the next cuts are inside the live layers: army (65 tokens, 23%) and last orders (38, 12%), then node ids and cluster ids.

Ablation 2 over three games (17-19): packet real p50 427 / 415 / 508 (baseline 720), no-op share 12.7 / 8.9 / 7.6%, reaction p50 3.9 / 3.9 / 4.0 s (baseline 4.9), 3 wins, $2.15. The one cost: `gather` needs a node id from `F`, and `F` is absent on 4 packets in 5; game 19 paid for it once its home fields ran dry. Harness answer, `--ashfall-fields-on-demand true`: `F` stays on every packet while a harvester is idle or a worked field is at 0 ore. Offline over games 17-19 it raises `F` presence from 18% to 37 / 28 / 46% of packets and est p50 by 0-9 tokens in games 17-18, by 112 in game 19 (idle harvesters all through its long tail, which the ids would have ended).

## Opponent profile
Scout ~25 s, riflemen from ~90 s, waves of 6-9 every 15-40 s from ~3 min, from the map-centre side onto the nearest ore field, then parks ~11 from the core. Base is empty right after a wave fails.

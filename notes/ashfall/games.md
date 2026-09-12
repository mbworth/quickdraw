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
| 20 | 37 | sonnet, quickdraw | loss | 10:24 | ablation 2 config + `--ashfall-fields-on-demand true`: 219 decisions (21/min), reaction p50 4.1 s / p90 7.6 s (wait 1.2 s), model p50 2.0 s, 121 out tokens, packet 467 real (est 334; `F` on 40% of packets), 17 timeouts, kept 36.3%, 14 rejected (`no units matched` 10, **0 blind gathers**: 15 of 19 gathers carried a node id), no-op 12%, $0.88. The flag did its job. The loss is the game-16 shape: pushed east with 3 at 1:30 and 7-8 at 2:40 in separate orders, traded the ball away, core died at 10:24 |
| 21 | 38 | sonnet, quickdraw | loss | 7:54 | game 20 config + step 7 expand fix (labels resolve on the packet's state, `idle` = idle harvesters for gather/repair, tool description names labels): 144 decisions (18.2/min), reaction p50 4.3 s / p90 8.5 s (wait 1.1 s), model p50 2.1 s, 121 out tokens, packet 423 real, 15 timeouts, kept 47.2%, **2 rejected** (14 in game 20), bad-id 12 (all `idle` with no idle harvester, now a client drop), no-op 13%, $0.60. **0 cluster labels used** (8 in game 20, 15-20 in games 15-19); ids per unit-list order p50 8, p90 13: the model lists ids that are not in the packet at all (sequential guesses like #10011, #10015, #10020, mostly alive, so the server takes them). Lost the ball at 4:00 attacking with 15 into the enemy anchor; core died at 7:54 |
| 22 | 39 | sonnet, quickdraw | loss | 6:54 | game 20 config + `--thinking off` (step 2 game 1): 112 decisions (16.3/min), reaction p50 5.6 s / p90 8.7 s (wait 2.0 s), **model p50 2.8 s** (2.1 in game 21), **141 out tokens** (121), packet 397 real, 12 timeouts, kept 38%, 3 rejected, no-op 8%, $0.49. Without adaptive thinking the model writes more (out p90 206 vs 158) and slower per token (19.8 vs 17.5 ms); sent riflemen east in ones and twos from 1:00. Adaptive/low stays |
| 23 | 40 | sonnet, quickdraw | **win** | 4:24 | game 20 config + `--ashfall-no-note true` (step 2 game 2): 82 decisions (18.8/min), reaction p50 5.4 s / p90 8.3 s (wait 1.4 s), model p50 2.7 s, **89 out tokens** (121), packet 396 real, 4 timeouts, kept 41.8%, 0 rejected, no-op 17%, $0.32. Output down a third; model latency did not follow (2.7 s, same as game 22's, so the API was slow this hour). Never built a turret; ball of 11 pushed at 2:55 and killed the core at 4:24, the fastest win |
| 24 | 41 | sonnet, quickdraw | loss | 14:30 | **first full capture** (prompt, schema, raw responses in the run). Bench config: slim + fold + fields on demand + no note + **compact buildings** + expand sugar: 228 decisions (15.7/min), reaction p50 5.6 s / p90 8.7 s (wait 1.5 s), model p50 2.8 s (API slow this hour, as in 22-23), 101 out tokens, packet 467 real, 21 timeouts, kept 42.8%, 1 rejected, no-op 6%, $0.89. **Turret at 2:41, first push at 3:25 with 11 and the turret up**: the first slim game to follow rule 3 as game 15 did (bench prediction held). 25 pushes over 14 minutes, none broke through; core died at 14:30 |

## Pace
Every Claude Code MCP call costs ~2 s client side (local stdio 1.7 s, live 2.1 s, network 0.2 s). Loop length = model gap + call + wait. Game 11 decided every 27 s.

Quickdraw (game 12, `bin/pace.mjs runs/ashfall-28.jsonl`): 19.4 decisions per game-minute, 8 of 85 calls timed out, reaction p50 4.0 s / p90 7.2 s (event arrival → last result, event-anchored decisions with orders, n=35), model p50 2.0 s, packet 660 real tokens p50 (481 est + framing; above the 600 target). The 2 s between model latency and reaction is queue time: 145 of 326 trigger outcomes waited for a call in flight, and an event waits for the next 500 ms state push. Calls 1 and 2 timed out at the 6 s deadline (cold cache write + strict schema compile); the first call now gets 3× the deadline. Orders kept 27.9%: the prompt's "spend everything" makes the model order purchases the bank cannot pay yet; validate drops them for free, but each is a wasted slot in the batch.

Games 13-15 (same harness, three prompts): the defend-only prompt never attacks; "attack the enemy base" without a coordinate walks in circles; the mirror rule wins. Harness lead from game 14: orders that list 27 ids cost output tokens and deadline timeouts; cluster labels or `army` should be the default selector.

Game 16 (M7 ablation 1, `bin/layers.mjs`): with fields on 1 packet in 5 the packet fell from 720 to 467 real tokens; on slim packets buildings is now the largest repeated layer (66 tokens, 100% repeat), army the largest live one (54). Fields still costs ~300 tokens on the packets that carry it: 5 node ids per explored field.

Game 17 (ablation 2, fold + full buildings + every 5): packet 427 real, est 273, a win at the best reaction time so far (3.9 s p50). Real minus est is a steady ~150 tokens of message framing, now a third of the packet; the next cuts are inside the live layers: army (65 tokens, 23%) and last orders (38, 12%), then node ids and cluster ids.

Ablation 2 over three games (17-19): packet real p50 427 / 415 / 508 (baseline 720), no-op share 12.7 / 8.9 / 7.6%, reaction p50 3.9 / 3.9 / 4.0 s (baseline 4.9), 3 wins, $2.15. The one cost: `gather` needs a node id from `F`, and `F` is absent on 4 packets in 5; game 19 paid for it once its home fields ran dry. Harness answer, `--ashfall-fields-on-demand true`: `F` stays on every packet while a harvester is idle or a worked field is at 0 ore. Offline over games 17-19 it raises `F` presence from 18% to 37 / 28 / 46% of packets and est p50 by 0-9 tokens in games 17-18, by 112 in game 19 (idle harvesters all through its long tail, which the ids would have ended).

Game 20 (fields on demand, live): `F` on 40% of packets, packet 467 real (+40-50 over games 17-18), blind-gather rejections 24 → 0. Loss: the ball left in pieces at 1:30 and 2:40. Across the slim configs (games 17-20) it is 3 wins, 1 loss; game 16 (fields every 5th packet, nothing else) also lost the same way, so the two losses both came from dribbled attacks, a prompt property, not a packet one.

Step 7 (order size), game 21: the expand fix removed the label failures and the `idle` rejections (rejected 14 → 2, label drops 60 → 0 over the recorded games), but the model then used no labels at all and listed ids it had never seen: the packet shows `tr x8@21,33 i` with no ids, the order names 15 ids, 14 of them absent from the packet. Ids are cheap for the model to guess and the server accepts the live ones. Output tokens p50 stayed at 121, so the id lists sit in the p90 (158 vs 121). The harness lever left is the schema: `maxItems` on unit lists forces labels or selectors for big groups.

## Decision quality (2026-09-12, after game 23)
Win rate on the prompt-15 harness: full packet 1/1 (game 15), slim configs 4 wins / 4 losses (games 16-23). `bin/discipline.mjs` scores each run against the frozen prompt's own rules. Game 15 built its turret at 1:34 and pushed at 2:22 with 8 and the turret up. Every slim game (16-21) pushed at 2:10-3:00 with 8-10 riflemen and **no turret**: the turret came at 2:54-5:12 or never (game 23). First pushes were never pieces (always 8-11); the losses came from the ball dying and no second push (games 21-22: 1-2 pushes in the game against 12-51 in the wins).

Rehearsal A/B on the same fixture states (`bin/rehearse.mjs --slim …`, 5 repeats of the four decisive states, $0.45 in total): at t169 the full packet orders the turret 5/5, the slim packet 2/5, slim + anchor lines (core and turret always in `B`, `--ashfall-keep-anchor true`) 5/5. The turret rule needs to see that no turret exists; the prompt reads that from `B`. At t214 the full packet pushes the ball 5/5, slim 2/5, anchor 2/5, anchor + `M` always 3/5: what else the full packet carries (fields, the rest of `B`) is worth 2-3 of 5 pushes there, unexplained at this sample. Pushes go to -65,-25 in every arm: the prompt's example coordinates, not the mirror of the fixture's core at 70,4, so the mirror rule is not computed either way.

### Decision bench (`bin/bench.mjs`, 2026-09-12)
Nine fixed states, each with the order the prompt calls for (`test/games/ashfall/bench/cases.mjs`), five repeats per arm, ~$0.20 an arm. Pass rate is the decision-quality metric; live games are for win rate only.

| arm | pass | est tokens | out tokens | notes |
|---|---|---|---|---|
| full packet | 76% | 448 | 134 | push 0/5 (`attack target:0` when nothing is visible), repair 0/5 (`repair units:["idle"]` with no idle harvester) |
| game 24 config (slim + fold + full buildings + fields on demand + no note + keep anchor) | 58% | 162 | 110 | train 2/5, turret 1/5, dry 1/5: every case that needs to know what buildings exist |
| game 24 config + expand sugar | 69% | 162 | 112 | sugar: `idle` with no idle harvester → the harvester nearest the job; `attack` on a remembered building → attack-move there; attack target described as "visible in X". repair 5/5, push 3/5 |
| slim + fold + fields on demand + no note + **compact buildings** (`--ashfall-compact-buildings true`: one always-on `B` line, ids and types, positions for core and turrets, hp/bld only when hurt or unfinished) | **76%** | 174 | **88** | equal to the full packet at 39% of its tokens and 66% of its output; turret 1/5 (builds the depot first at s17/18, which rule 1 also asks for) |

The bench found two harness gaps the games had hidden (the `attack target:0` habit and the `idle` harvester selector) in its first run, and showed that the buildings layer, not fields, is what the prompt's build logic reads. Both fixed in expand and the encoder, no prompt change.

### Trajectory replay (`bin/trajectory.mjs`, game 24 recording, every 3rd decision, 84 decisions an arm)
| arm | agrees with the recording on command kinds | no-op | est tokens | out tokens | cost |
|---|---|---|---|---|---|
| the recorded config replayed on itself | 54% | 23% (recorded 30%) | 306 | 116 | $0.33 |
| full packet (game 15 config) | 36% | 20% | 577 | 146 | $0.42 |

The noise floor is the finding: with identical prompt, packet and schema the model returns the same kinds of orders on 54% of decisions. Per-decision agreement is therefore not a usable metric; arms have to be compared on rates over many decisions (no-op share, orders per decision, drop reasons, rule adherence), and a difference under ~15 points at this sample is noise. The two arms agree with each other on 36% of decisions; agreement is highest in the opening (minute 0: 6-7 of 8) and lowest in fights (minutes 2-6: 0-2 of 4-6).

Rule adherence over the same rows (`test/games/ashfall/bench/rules.mjs`, pass/applies; the recording scored the same way):

| rule | same config | full packet | recorded |
|---|---|---|---|
| turret when none and ore ≥ 110 | 1/2 | 1/2 | 1/2 |
| depot when capped | 1/1 | 1/1 | 1/1 |
| spend when ore ≥ 120 | 10/13 | 8/13 | 7/13 |
| push with 8 idle and turret up | 1/10 | 5/10 | 2/10 |
| whole ball (no pieces) | 1/10 | 6/16 | 2/8 |
| gather with a node id | 3/6 | 5/10 | 1/5 |
| attack only what is visible | 3/9 | 4/9 | 2/2 |
| repair a hurt turret | 0/0 | 0/0 | 0/0 |
| no chase under 8 | 18/23 | 17/23 | 19/23 |

At 84 decisions most rules apply fewer than 15 times, so only `noChase` and `spend` are read at this sample; the push and gather rows need `--every 1` (three times the calls) or several recordings. The same-config arm is the tool's calibration: its rates should match the recording's, and mostly do (the attack row is the exception: 9 attacks against 2 recorded, worth a look).

## Opponent profile
Scout ~25 s, riflemen from ~90 s, waves of 6-9 every 15-40 s from ~3 min, from the map-centre side onto the nearest ore field, then parks ~11 from the core. Base is empty right after a wave fails.

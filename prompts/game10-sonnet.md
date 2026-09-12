# TOOL CALLS ONLY. NO WORDS.
Do not write any text until the game is over: no thoughts, no plans, no summaries, no "I will". Read the result, make the next call. Text costs game seconds.

One call per turn: `orders` with your commands, last entry `{do:"wait",args:{seconds:5}}` (up to 15 when nothing hostile is in vision). Never call `state` or `wait` alone.

You play Ashfall Sector against the scripted AI on `mcp__ashfall-live__*` only (ToolSearch "select:mcp__ashfall-live__rules,mcp__ashfall-live__register,mcp__ashfall-live__create,mcp__ashfall-live__start,mcp__ashfall-live__orders,mcp__ashfall-live__state,mcp__ashfall-live__wait,mcp__ashfall-live__concede"). Steps: `rules`, register if needed, `create` with size 200 (EXACTLY 200), opponent "scripted", name "sonnet vs AI, game 10". Confirm 200. `start`. Loop until the game ends. Do not concede.

## Play
1. Spend everything, every turn, on purpose. Ore sitting in the bank is a unit not fighting. Each turn pick the purchase that fixes your current bottleneck: no barracks → barracks; under 8 harvesters → harvester; income idle → riflemen at every barracks (`train` count); production capped → second barracks; supply capped → depot; crystal ≥40 → weapons. If you cannot name what the ore is for, it is wasted.
2. Defend at one anchor only: turret ~8 from the core on the map-centre side, riflemen dug in beside it, rally set there. Never fight with fewer than 8, never mid-map.
3. Attack only after a wave breaks and you have 15+ riflemen: whole ball, attack-move, group, straight at their harvesters and barracks. Reinforce in groups of 4+.
4. Harvesters never go toward the enemy. Keep two mining groups on different fields; expand early (~5 min) to the field farthest from the enemy, not the one nearest the fight.
5. Target priority when attacking: harvesters repairing the building you shoot die first, then the building. If the ball is not under fire, hunt harvesters before buildings.
6. Turret under 60% → repair and pull the ball onto it. Warden sighted → ball attack-moves at it; never `attack` a kiting unit.

## Opponent
Scout ~25 s, riflemen trickle from ~90 s, waves of 6-9 every 15-40 s from ~3 min, from the map-centre side onto your nearest ore field, then parks ~11 from the core. Its base is empty right after a wave fails.

When the game is over, and only then, write: result, game id, map size, duration; what went well, what did not, what to change. Concise, with timings and counts.

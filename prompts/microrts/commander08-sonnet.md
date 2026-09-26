# MicroRTS — commander (basesWorkers16x16)

You are the commander, not the hands. A scripted reflex plays every packet for you, in 0 ms, from the parameter set
you last set. You are called every few seconds, on your own clock, not on the packet's — the reflex has already
acted on packets you never see. Each call you return the whole parameter set (defaults stay unless you change them)
and a note. Get it right in aggregate, not packet by packet.

## The board

16×16, no fog: you can see everything. `0,0` is the top-left corner, `x` runs right, `y` runs **down**. My base starts
at `2,2`, theirs at `13,13`. Four resource nodes: two beside my base, two beside theirs.

Costs and times: see Units below.
A Worker has 1 hp and does 1 damage, so worker-versus-worker is a coin flip. A Light has 4 hp and does 2: it kills a
worker in one swing and takes four to die. **A Light is worth about four workers.** A Base has 10 hp and cannot fight.

### Units (exact)

| unit | cost | hp | dmg | range | move (cycles/step) | attack cadence (cycles) | produce (cycles) |
|---|---|---|---|---|---|---|---|
| Worker wk | 1 | 1 | 1 | 1 | 10 | 5 | 50 |
| Light li | 2 | 4 | 2 | 1 | 8 | 5 | 80 |
| Heavy hv | 3 | 8 | 4 | 1 | 10 | 5 | 120 |
| Ranged rg | 2 | 1 | 1 | 3 | 10 | 5 | 100 |

Base ba: 10 hp, cost 10, makes Workers. Barracks br: 4 hp, cost 5, 100 cycles to build, makes li/hv/rg. Worker
harvest 20 cycles at the node, return 10. Damage is fixed (no randomness). One unit per cell.

### Counters (derived from the table; state the arithmetic)

Swings to kill = ceil(target hp / dmg); a swing is 5 cycles. Light kills a Worker in 1 swing, a Ranged in 1, a Light
in 2, a Heavy in 4. Heavy kills Worker/Ranged in 1, Light in 1, Heavy in 2. Ranged kills a Worker or Ranged in 1, a
Light in 4, a Heavy in 8 — but hits from 3 cells away, so a Ranged gets ~2 free swings on a unit walking in (2 steps
at 8–10 cycles/step vs 5 cycles per swing). Worker kills Worker/Ranged in 1, Light in 4, Heavy in 8. So: Heavy beats
Light one on one (1 swing vs 4) and beats two Lights; a Light beats Ranged if it reaches it (Ranged 1 hp) and Ranged
beats a Light only in numbers or behind a blocker; Workers beat a lone Ranged and lose to a Light unless 3+ on it at
once; Heavy costs 3 and 120 cycles against Light's 2 and 80, so per ore Heavy still wins the fight. Barracks (4 hp)
dies to a Heavy in 1 swing, a Light in 2. Base (10 hp) dies to a Light in 5 swings = 25 cycles once in contact.

### Timings on this map

My base 2,2, theirs 13,13: 22 steps. Light 176 cycles base to base; Worker/Heavy/Ranged 220. Their first barracks (5
ore, 100 cycles) can stand by ~t150 if they mine first; first Light out ~t230, at my base d6 by ~t400 — LightRush's
first Light was inside d6 at t399 in every recorded game. HeavyRush's first Heavy reaches d6 t525–1130. CoacAI shows
hv+rg by t554. WorkerRush sends single workers from t200. Our own opening: barracks t249, first Light t369 at
`barracksAt` 3; lowering `barracksAt` buys ~50 cycles per worker skipped but each skipped worker is 1 ore per ~30
cycles not mined. A Light from my barracks at 0,2 reaches the post at 3,3 in ~32 cycles and their base in ~176.

### Openings and what beat them (our games 38–67; starting points, not rules)

- **Worker stream** — tell: `foe wk` stream, single workers from t200. `defend` 6 already answers them; 5/5.
- **Early Light** — tell: `foe li` by ~t250, their Light at d6 by t399, before ours. Beat us: base fell ~t649 when
  the lone Light chases. Beat it: hold the post until 3 units then push; one win pushed at 2 from t1374.
- **Paired Heavies** — tell: `foe hv`, slow, arrive in pairs from t525. Beat us: two inside `defend` at once, or our
  army 8 tiles out when the second arrived. Beat it: 3 units pushed with one raider already dead at home; `train hv`
  or `li,rg` 1/3 each.
- **Heavy plus Ranged** — tell: `foe hv` and `foe rg` by t554; their Heavy crosses d6→d1 in ~10 cycles while our
  defenders stand 2–4 tiles off, barracks dies ~t624. Nothing has beaten it yet; best games held them out until
  t854–884 by pushing early with 2 Light + workers, then died at their door.

### Engine facts

One unit per cell; an attack-move at an occupied cell (a building) stops one step short and fights from there. A
launched push has no recall except an enemy inside `defend`. A unit with a standing `train` count keeps producing
while the bank covers it; a `train` list orders one unit per decision so the barracks idles between them. Distances
in `X` are steps from the enemy cluster's centre, 1–2 short of the nearest unit when a cluster is spread.

## The packet

Layers, in this order. A layer reading `none` means it is empty.

```
H t804 r3 u6/6            cycle, my bank, my mobile units / theirs
D +li#50 -wk#22 r-2       what changed since my last decision
T done li#50; lost wk#22  the triggers that woke this decision
P ba#20 wk 31; br#47 li 56   each of my buildings: what it is making and cycles left, or IDLE
E                         resource nodes: id, position, what is left, steps from my base
rs#16@0,0 o19 d4
A                         my mobile units, clustered: count@position, state, then every id
wk x2@4,2 m #40,#51
B ba#20@2,2 hp7 br#47@0,2 hp4     MY buildings only, with hp. Theirs never appear here.
X                         THEIR units and buildings (no hp shown): steps to my base / to my nearest unit. Their base is dead once no `ba` line is here.
wk x1@3,4 d3/1 #45
G                         the game so far, one line per 50 cycles: what they built and where, what I lost, what I killed
t200 foe wk#28@13,14; seen at 0,2 x3; lost wk#29
R                         my recent decisions, one line each: cycle, what woke me | what I ordered and what came of it
t205 seen at 0,2 | t 20 wk 5 ok; a #27 2,9 ok
L t 20 wk ok; h #22 #16 busy      the reflex's last orders and what became of them
N plan: ... | doing: ...   my own note from my last call (see Memory)
F set 3 in force 5 decisions: workers 6>4 | orders differed 2/5 | plan: hv by t900 | expect hv>=3 by t1300: MISSED (max 2) | last: a 12,13 / was h 5   what your last set did and how your plan graded (see Feedback)
```

Vocabulary: `wk` Worker, `li` Light, `hv` Heavy, `rg` Ranged, `ba` Base, `br` Barracks, `rs` resource node.
Entities are `type#id`. Everything is an integer.

## O lines

After `F`, zero or more `O <name>:` lines: facts the harness computed from every packet, including ones you never saw. Each is a fact with numbers, `my` or `their` naming whose; none is advice.

- `O near:` their nearest mobile cluster to my base (a Light/Heavy/Ranged within 12 before any worker): `d N to my base`, and `was d N @tC` when the same cluster was seen ~100 cycles earlier.
- `O home:` my army (li/hv/rg) within `defend` (manhattan) of my base and the rest as a distance range; my workers within `defend` of my base; their nearest mobile distance to my base.
- `O reach:` your `expect`: the metric's count, and its change since you set the claim (`gap` and `rate` when they point opposite ways).
- `O trig:` each reflex trigger in force beside its count on the board: pushLight vs my army, barracksAt vs my wk and br, pushWorkers vs my fighters (no barracks), defend/panic vs their nearest mobile distance.
- `O foe:` their barracks (first cycle until t600); per unit type alive, peak alive, change over ~300 cycles.
- `O fight:` the last two fights: cycles, place (or `place unknown`), what I lost and what I killed.
- `O gone:` their newest two buildings no longer in `X` and since when; a unit type of theirs at 0 after a peak of 2 or more.
- `O econ:` my bank (and coins committed to production under way); mined and spent in the last ~100 cycles and on what; each building's IDLE cycles in that window.

## Memory

- `G`, the game so far: what the opponent built and where (`foe`), where their units showed up (`seen`), what died.
  Read it for the shape of their play — a stream of workers from the south-east is a rush; a `foe li` is tech.
- `R`, the reflex's recent decisions: what woke it, what it ordered, what came of it.
- `N`, your own note, the one thing you write. Facts and intent only, never a conclusion or a reason: no `why`, no
  judgements, no words like "no threats", "safe", "far", "soon" — only ids, cycles, counts, positions.

  `plan: <what you're doing and why in one clause> | doing: <the parameter change in force, with numbers>`

  Keep the note under 300 characters. The checkable claim goes in the tool's `expect`, not here.

## Your call

You set the whole parameter set the reflex plays until your next call. Every parameter has a default; state only what
you're changing and why in your note, but the tool call always carries every field. Your answer lands about 45
cycles after the packet you're reading — set what will still be right then, not a reaction to one unit's position.

- `harvesters` (default 2): tops up mining workers each decision (rule 1). A worker already mining keeps its trip;
  only the shortfall changes, so the bank effect shows over several cycles, not this one. Cost: each harvester is a
  worker not fighting or building — more harvesters, more bank, fewer fighters. Wrong lever for a raid (`defend`,
  `panic`). For a starved barracks it is the lever once `P` shows the base IDLE (workers at cap: nothing left to cut, only
  income to raise); while the base is still buying workers, `workers` is.
- `workers` (default 6): worker cap. The base trains a worker whenever the bank covers one and count < cap, and it
  runs **before** the barracks — the barracks only gets the bank if it covers both. Lowering `workers` is the only
  way to give the barracks the bank. Cost: fewer new workers, eventually fewer harvesters as mining workers die
  unreplaced. Wrong lever to grow the army directly — it buys workers, not fighters — and does nothing once `P` shows
  the base IDLE: the cap is already met and the barracks is short of income, not of the bank's share (`harvesters`).
- `barracksAt` (default 3): worker count that triggers the barracks build (5 ore, 100 cycles). Lower = earlier Light
  off a thinner economy. Wrong lever once a barracks already exists — check `B` for `br` first; it does nothing then.
- `barracks` (default 1, 1-3): barracks the reflex builds up to, one at a time, each 5 ore; every barracks trains from `train`.
- `defend` (default 6): pulls every free fighter onto any enemy within this many steps of my base. Acts the cycle the
  reflex sees the enemy. Cost: too wide sends the defender chasing a distant raider while a second raider takes the
  base undefended. Wrong lever to recall a push — a push in flight doesn't answer to `defend`.
- `panic` (default 2): inside this distance, harvesters also drop their ore and fight. Cost: lost mining trips while
  it's true. Wrong lever to fight harder — it only changes who's in the fight, not how it goes.
- `pushLight` (default 3): the attack launches when my combat units — any type, not just Light — reach this count.
  It's a trigger by count; it does not build anything (`train` does). Lower = earlier, smaller push. There is no
  recall: once launched, the push fights until it dies or the target falls; only `defend` pulls units back, and only
  units within `defend` of my base. Wrong lever to grow the army (that's `train`/`workers`) or to call a push home.
- `pushWorkers` (default 6): same trigger, on total fighters, when no barracks is up or coming. Wrong lever once a
  barracks exists — `pushLight` governs from there.
- `post` (default 1): steps from my base toward the target where idle free fighters hold between fights. Changing it
  moves the rally point; fighters already free walk there over the next few cycles. Wrong lever to start or stop the
  attack — that's `pushLight`/`pushWorkers`/`target`.
- `guard` (default 0): army units (li/hv/rg, never workers) nearest my base that stay at the post when a push fires;
  the rest push. With army at or below `guard`, all hold the post. Does not change the `pushLight` trigger.
- `target` (default null): `"x,y"` override. The reflex already picks their base, then their nearest other building,
  then the far node, in that order — `target` only matters to hit something else. Six games, 11 sets, never beat the
  fallback. Wrong lever if it just repeats what the reflex would already pick.
- `plan` (required): your plan in one line, your own words, at most 120 characters. It comes back on the next `F` beside what
  actually happened.
- `expect` (required, `null` to claim nothing): the checkable claim that plan makes, `{metric, op, value, by}` — e.g.
  `{"metric": "hv", "op": ">=", "value": 3, "by": 1300}`. Metrics, all read off the packet: `wk li hv rg` my counts, `army`
  = li+hv+rg, `foe_wk foe_li foe_hv foe_rg` theirs as seen, `bank`, `base_hp` (MY base's hp; theirs is not measured), `br` and `foe_br` (barracks alive, 0/1). `op`
  is `>=`, `<=` or `==`; `by` is a cycle. It is graded on every packet, not just the ones you see.
- `train` (default `li`): comma list of `li`, `hv`, `rg` for the barracks (Light 2/80 4hp 2dmg; Heavy 3/120 8hp 4dmg
  slow; Ranged 2/100 1hp 1dmg range 3). One type keeps a standing order of 5 that self-refills. A list of more than
  one cycles a single unit at a time by what already exists, so the barracks idles between your calls — that idle is
  the mix's cost, not a bug. Wrong lever to react to one fight; commit to it only if you can call back soon.

## Feedback

`F` reports what your last parameter set actually did:

```
F set <n> in force <k> decisions: <param> <old>><new> ... | orders differed <x>/<k> | plan: <your plan> | expect <metric><op><value> by t<by>: <grade> | last: <orders> / was <orders under the previous set>
```

`F none` before your first answer. `unchanged` in place of the change list when your last call didn't change the
set. "orders differed 0/k" means the reflex has issued the same orders it would have under the old set every time
since — your change hasn't shown up in play yet.

When your newest set has not been played yet, `F` reports the set before it (the last one with decisions to count) and
ends `| set <n> landed: <its changes>`.

`plan` and `expect` are your own words from your last call, echoed back with what the packets since then measured:
`MET t<cycle>` at the first packet the condition held, `MISSED (max <best>)` once the cycle passed `by` without it,
`pending (max <best>, t<cycle>)` before the deadline, `expect: none` when you claimed nothing. The best value is the
max for `>=`, the min for `<=`, the last for `==`. The plan is yours; the grade is evidence about it.

A new `expect` with the same `metric` and `op` as the one in force is graded as the same claim, not a fresh one: the
best value keeps accumulating from when the claim was first made (`max since t<cycle>`), and the line gains `; claim
since t<cycle>, by moved <n>x, value <v1>><v2>>...` — how many times `by` has been pushed and the sequence of
`value`s claimed, when either changed.

Read `F` first, before `N`, `R`, or `G`. If the last change shows `orders differed 0/k`, don't set it again — pick a
different lever.

Starting points from this game's evidence, not rules — the grade is what says whether they hold here:

- WorkerRush sends single workers from cycle ~200: `defend` 6 already answers them — do not lower it.
- Against Heavy or Ranged (`foe hv` / `foe rg` in `G`), prefer `train hv` at `pushLight` 3 over a mix.
- If the bank sits at 0–2 with the barracks already up on `B`, lower `workers` — it is starving the barracks.
- To get more Light while the base is buying workers, lower `workers`; once the base reads IDLE, raise `harvesters` —
  raising `pushLight` doesn't build anything.
- After a push kills their base, set `pushLight` high and `post` 1 so the survivors come home — nothing else recalls them.
- Two harvesters feed one barracks about one Light per 100 cycles. A barracks that reads IDLE between units with the base IDLE
  too is short of income: `harvesters` 3–4. Drop it back when a node on `E` reads `o0` (dry).
- Identify the opening from `G` by t300 and take the counter from the table as a first try: early Light → hold the post, do not chase, and pick `train` from the unit table against what they field; paired Heavies → `train hv`, `pushLight` 3, push only when `X` shows no `hv` inside
  `defend`; Heavy plus Ranged → `train hv`, `defend` 8, `panic` 4 before t550, expect the barracks to be their first
  target.

`expect` must be a number the next call can check — a cycle, a count, or a distance.

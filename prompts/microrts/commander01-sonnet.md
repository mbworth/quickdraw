# MicroRTS — commander (basesWorkers16x16)

You are the commander, not the hands. A scripted reflex plays every packet for you, in 0 ms, from the parameter set
you last set. You are called every few seconds, on your own clock, not on the packet's — the reflex has already
acted on packets you never see. Each call you return the whole parameter set (defaults stay unless you change them)
and a note. Get it right in aggregate, not packet by packet.

## The board

16×16, no fog: you can see everything. `0,0` is the top-left corner, `x` runs right, `y` runs **down**. My base starts
at `2,2`, theirs at `13,13`. Four resource nodes: two beside my base, two beside theirs.

Costs and times (cycles): Worker 1 / 50, Barracks 5 / 100, Light 2 / 80, Heavy 3 / 120, Ranged 2 / 100, Base 10 / 200.
A Worker has 1 hp and does 1 damage, so worker-versus-worker is a coin flip. A Light has 4 hp and does 2: it kills a
worker in one swing and takes four to die. **A Light is worth about four workers.** A Base has 10 hp and cannot fight.

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
B ba#20@2,2 hp7 br#47@0,2 hp4     my buildings
X                         their units: steps to my base / to my nearest unit
wk x1@3,4 d3/1 #45
G                         the game so far, one line per 50 cycles: what they built and where, what I lost, what I killed
t200 foe wk#28@13,14; seen at 0,2 x3; lost wk#29
R                         my recent decisions, one line each: cycle, what woke me | what I ordered and what came of it
t205 seen at 0,2 | t 20 wk 5 ok; a #27 2,9 ok
L t 20 wk ok; h #22 #16 busy      the reflex's last orders and what became of them
N plan: ... | doing: ... | expect: ...    my own note from my last call (see Memory)
```

Vocabulary: `wk` Worker, `li` Light, `hv` Heavy, `rg` Ranged, `ba` Base, `br` Barracks, `rs` resource node.
Entities are `type#id`. Everything is an integer.

## Memory

- `G`, the game so far: what the opponent built and where (`foe`), where their units showed up (`seen`), what died.
  Read it for the shape of their play — a stream of workers from the south-east is a rush; a `foe li` is tech.
- `R`, the reflex's recent decisions: what woke it, what it ordered, what came of it.
- `N`, your own note, the one thing you write. Facts and intent only, never a conclusion or a reason: no `why`, no
  judgements, no words like "no threats", "safe", "far", "soon" — only ids, cycles, counts, positions.

  `plan: <what you're doing and why in one clause> | doing: <the parameter change in force, with numbers>
  | expect: <checkable next call by a number — a cycle, count, or distance>`

  Keep the note under 300 characters. If `expect` fails, change the plan, not just the note.

## Your call

You set the whole parameter set the reflex plays until your next call. Every parameter has a default; state only what
you're changing and why in your note, but the tool call always carries every field.

- `harvesters` (default 2): workers kept mining at once; a worker already mining keeps its trip, only the shortfall
  is topped up.
- `workers` (default 6): worker cap — the base makes a worker whenever idle and the bank covers one, up to this many.
- `barracksAt` (default 3): worker count at which the free worker nearest my base builds a barracks, bank permitting.
- `defend` (default 6): distance to my base that pulls every free fighter onto an enemy.
- `panic` (default 2): distance inside `defend` that also pulls the harvesters off their nodes to fight.
- `pushLight` (default 3): Light count that triggers the attack on their base.
- `pushWorkers` (default 6): fighter count that triggers the attack when no barracks is coming.
- `post` (default 1): steps from my base toward theirs where idle fighters hold ground between fights.
- `target` (default null): `"x,y"` to override where the push/post aims, in place of their base or the far node.

When to change what, from this game's evidence:

- WorkerRush sends single workers from cycle ~200: `defend` 6 already answers them — do not lower it.
- If `G` shows `foe li`, raise `pushLight` and `defend`.
- If their base is gone (`X` has no `ba`), set `target` to the far node from `E` (largest `d`).
- If the bank sits at 0–2 with the barracks already up on `B`, lower `workers` — it is starving the barracks.
- Keep `harvesters` at 2 unless a node on `E` reads `o0` (dry).

`expect` must be a number the next call can check — a cycle, a count, or a distance.

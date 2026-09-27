# Handoff — 2026-09-17

Where Quickdraw stands and what to do next. History lives in `notes/ashfall/games.md` (every game, one row, and what it taught), `docs/reviews/` (the four reviews and what they fixed) and `git log`. Nothing here repeats those.

## Current aim (2026-09-21): a commander that plans, watches its plan, and leaves the script when the script is failing

The script reflex is a fixed plan with parameters. It wins where its rules fit (WorkerRush 5/5) and loses where they do not
(LightRush 1/3, HeavyRush 0–1/3, CoacAI 0/3). The commander's job is the part a script cannot do: read the opponent, hold a
plan of its own, notice when that plan or the script's rule is not working, and change it. Everything below is measured against
that, not against win rate alone. Full log: `notes/microrts/games.md` (games 38–162).

**What is settled.**
- Speed: the reflex answers at 0 ms; the commander's set lands one model latency later (Sonnet ~4 s, Fable 5.1 ~15–20 s). The loop
  is serial, so `--commander-every` below the latency does nothing (games 74–79).
- Information: packet facts are correct. The gaps were feedback, not facts (F layer, games 68–73) and one dead lever (`train`, fixed).
- Knowledge: commander03 carries the unit table, counters, timings and openings. It names the opening by ~t300 and picks the textbook counter.
- The failure that remains is **plan revision**. Sonnet states a plan ("hold until 3 Heavies, then push") and keeps it while the packet shows
  it cannot happen. Low, medium and high effort give the same answers with the same ~330 output tokens; a think-hard/adapt prod changes nothing.
  Debriefed out of game it says: it never checked whether its trigger was reachable, read `orders differed 0/k` plus "or wait" as permission
  to hold, followed the counter line as a rule, and would do what Fable does if "free" (pushLight 2, workers 4, recall).
- So the harness now grades the plan, as evidence, not as a rule: the tool takes `plan` (one line, the model's words) and
  `expect {metric, op, value, by}`; the game's `measure(packet)` grades it on every packet; `F` echoes the plan beside `MET` / `MISSED` /
  `pending`, and a restated claim keeps its history (`claim since t514, by moved 9x, value 3>4>3`). `commander05-sonnet.md` describes the
  grade and prescribes nothing; the counters are "starting points, not rules".
- Result (replay of game 80, then live games 86/87): same evidence, different models. **Sonnet moves the deadline; Fable 5.1 changes the plan**
  and says why ("stop chasing rg at d10: defend 5", "switch to Light vs the rg pair: 1 swing kill", `harvesters` 4). Live at equal lag
  (Fable on a 400 ms clock) Fable built 5 Heavies to Sonnet's 1, kept the barracks fed (17% idle-broke vs 51%), and landed the only hit any of our
  armies has made on CoacAI's base (10 → 6 hp). It still lost, at $1.98 a game vs $0.08.
- The ceiling has moved from the commander to the reflex: the push leaves strung out over three tiles and every fighter dies alone; the base is
  sniped by Ranged at three tiles with nothing adjacent; there is no recall.
- Reflex rules built since (games 86–156, $0): group push with a core of the largest cluster, engage gate, mop-up hunt by unit id, opening
  fixes (`barracksAt` 2 / `workers` 2). Script ladder: WorkerRush 2/2, GuidedRojoA3N 3/3, LightRush 3/3 (tuned), HeavyRush 0/3, CoacAI 0/1.
  No single parameter set is best everywhere, which is the commander's test.
- Sonnet commander05 on defaults (games 157–162, $1.65): LightRush **3/3** by push-stage nudges (never touched the opening), GuidedRojoA3N
  **0/3** where the script alone is 3/3: a stale `target` on the dead base's tile for 900 cycles (game 162), a target toggled between two
  barracks, "never push" after both bases fell. The commander subtracted judgement.
- Game 162 replayed: Fable retargets on the first packet after their base leaves `X`; Sonnet never does in 16 calls. Two Sonnet failings,
  separated by replay: it does not read the absence of a thing, and it reads our `B` base line as theirs. `F` now carries the game's
  `describe()` (what stands at the commander's own `target`, a fact) and `commander06-sonnet.md` labels `B` mine-only, `X` theirs and
  `base_hp` mine: labels alone 0 → 11/16 retargets, with the clause 14/16, Fable 16/16 ($0.15 a replay). Legend, not judgement.

**Open, in order.**
0. Classifiers (2026-09-23, built, untested live): `O` lines the harness computes for the commander, each a fact with numbers and no verdict, switched by
   `--microrts-classifiers near,trig,reach,foe,fight,gone,econ|all` (`src/games/microrts/policy/observe.mjs`; prompt `commander07-sonnet.md` carries the legend).
   Test each offline first: `bin/replay-commander.mjs <run> --prompt prompts/microrts/commander07-sonnet.md --at --classifiers <set>` on game 162's run
   (`mub5ms7q`, retarget after t2018): corrected baseline 5/16, `gone` 16/16, `all` 15/16 (games.md, 2026-09-23). Game 164: `econ` moves `harvesters` 8/9 calls from t317 (0/9 without).
   Game 80: `harvesters` 16/22 vs 5/22, but the plan is still held with the trigger's shortfall printed in `trig`. Live GuidedRojoA3N (games 166–171): `gone,econ` **3/3** (commander05/06 was 0/3),
   `all` 1/3, both losses to worker raids on an undefended base with no recall (games.md). Ship `gone,econ` as the default set; `all` is not worth its tokens yet.
   `guard` lever added (army units held at the post while the rest push; script guard 1 vs GuidedRojoA3N 3/3, faster). Fable game 80 replay with `all`:
   nothing new but `harvesters` 100c earlier; `trig` moves neither model. `gone,econ` ladder (games 175–183): LightRush 2/3, HeavyRush 0/3, CoacAI 0/3,
   all out-produced. Built and tested 2026-09-25: `barracks` lever (max count, every barracks trains; script `barracks 2` vs HeavyRush 0/3, the base
   dies at t594 before a second barracks can stand) and `O home` (my army within `defend` of my base vs out; game 175 replay: Sonnet still never sets
   `guard`). Both levers exist for the commander; neither changes the ladder. HeavyRush/CoacAI are lost by ~t600 on the opening's economy, which is
   strategy, not harness (harness-not-strategy). The Sonnet commander's job on this ladder is done where reading was the failure (GuidedRojoA3N
   0/3 → 3/3); what remains is a model that pulls an unused lever from a fact: Fable does (game 175 replay: recall via `defend` 10/13 on the first
   `O home` line, garrison via `post`/`panic`/`pushLight`, `guard` once), Sonnet does not — model capability, same finding as plan revision.
   Fable live vs LightRush (187–188, 400 ms clock): 1/2, $1.57/$2.35; in the win it set `guard` 2 → 1 → 0 with a reason each time and held the base at hp6.
   The harness side is done for this aim; what is left is model choice (Sonnet $0.25 reads, Fable $2 acts) and the reflex's economy vs HeavyRush/CoacAI (strategy). Commit next.
   Event gate (2026-09-26, built; live games 189–190 both wins, $1.40 → $1.25 with home v2; launches 29 → 17 but output tokens per call rose, so the next lever is output per call; Opus 5.5 game 191 loss $0.26 at 10 s latency, held and raised the push trigger like Sonnet; replay of its call 4: `train hv` 4/9 plain, 8/8 with the new `O units` line (unit table beside the counts), Sonnet 0/8 either way — retrieval gap for Opus, reasoning gap for Sonnet; Opus live with `units` game 192 loss $0.31 (hv set at t502 as predicted, then flipped to li on bank 2, twice); prompt conflicts found in commander07 (a line prescribing `pushLight` raise on `foe li`, Early Light entry silent on `train`, bank rule vs 3-ore Heavy); commander08 drops them: Opus hv 6/8, Sonnet 0/8 and now holds instead of raising; Sonnet 0/24 across all arms; commander08 bank rule fixed, Opus game 193 loss $0.47 with hv held all game (no flip-flop), lost on economy 3 hv vs 6 li; Opus 0/3 vs Fable 2/2 on this setup, see games.md): `--commander-gate events [--commander-max-every 60000]` calls the commander only on a reason: first call,
   an observer event (`observe.events()`: gone/home/near/foe/fight/trig/econ transitions, per the switched-on classifiers), the expect turning MET/MISSED, or the
   Prompt comprehension ladder (2026-09-26, `bin/comprehend.mjs`, README "Prompt comprehension"): commander08 rewritten legend-first, second person, every advice line out, then proven readable section by section, by halves and whole (416/416, 410/416); the breaks were format (a grid, two representations of one fact, three definitions in one paragraph) and comparisons the model makes badly once tokens are named (`O econ` now says `most idle`). Reading is not Sonnet's wall; the call-4 replay on the combed prompt is the next check.
   heartbeat; the reasons ride as an `E` line and `summary.why`. Replay `--gate` keeps the recorded launches the gate would have made: game 162 21/52 (base-gone
   fires on seq 38 t2028, the retarget call), game 175 10/27. Expect flips are most of the kept calls. Aim: Fable's judgement at a fraction of $2 a game.
1. commander06 live on GuidedRojoA3N (3 games, ~$1): does a Sonnet that reads the board keep the reflex's 3/3. Then Fable on the same ladder (~$2 a game).
   The reflex stays as is: the user does not want a better scripted CoacAI; what the script cannot do is the commander's job.
2. Whether a cheap model can be brought to revise: the grade reaches Sonnet and it still holds. Untried: a required self-grade field in the tool
   (`last_expect: met|missed|pending`, `trigger_reachable`), Opus 5 on the same replay, a two-step call (grade first, then set).
3. Fable live at the real 100 ms clock needs overlapping commander calls (area of interest, not scheduled); until then a slower clock is the fair test.
4. `X` distance is to the cluster centroid, 1–2 low in a fifth of calls.
5. Replay caveat to remember: `replay80.mjs` (scratchpad) builds its own F and nothing the replayed model sets takes effect; only live games exercise
   the closed-window F fix.

## State

M0–M14 built; Ashfall 55 live games (hub games 1–76), MicroRTS games 1–162 (script, model and commander; see Current aim); `npm test` 310 tests, 304 pass, 6 skipped without a key or `MICRORTS_LOCAL`, 7 s. The harness levers inside a call are spent: reaction p50 5.6 s (game 24) → 2.2 s (game 30) by the order language, two calls in flight, the event tick and streaming dispatch; output 101 → 38 tokens, of which 29 are the forced tool call's framing; every packet layer is read (sensitivity); a third slot and a reserved slot sit inside one game's noise. Win rate on the game38 prompt (2026-09-14 evening campaigns): **the script 10 of 11** (games 39–49, 4.5–7.1 min, $0), **the model 4 of 5** (games 50–54, 5.4–14.6 min, $6.90); game 38 was the model's earlier loss on a quiet-packet commit.

**2026-09-14, late: the three-way split.** Every loss was ambiguous between the packet, the strategy and the model. Now `src/games/ashfall/policy/game38.mjs` plays the game38 prompt as code from the packet text alone (`src/games/ashfall/read.mjs` reads the packet back into facts, strict on the structured layers), through the same `callModel` seam as the API (`--model script:game38`, `scriptModel` in `src/core/model.mjs`, no key, $0). What it answers:
- **Is the packet sufficient?** The script passes the bench 13/13 on the working config and reads every packet of every recording (6,561). Anything it cannot read throws (`stop: error:read`), never a silent `-`.
- **Does the strategy win?** The script plays live at zero API cost: its win rate is the strategy's, at the harness's own speed. Campaign `script-game38` (games 39–49): 10 of 11, every game 4.5–7.1 min, barracks at 9 s, first commit 15–20 riflemen at 3:20–4:50, 1–4 pushes, ore p50 35–45. The loss (game 47): the commit at 3:46 with 16 met the enemy's home army and died. Reaction p50 0 s at 50–60 decisions a minute is the harness floor. Plan and packet are sufficient.
- **What is the model's share?** Campaign `model-game38` (games 50–54, Sonnet, same prompt and packet): 4 of 5, but 5.4–14.6 min (three games over 11 min), 14–71 pushes a game against the script's 1–4, first pushes of 7–8 riflemen in two games (Army 7 says 15), ore p50 45–95 with up to 44% of samples over 120 banked. `trajectory --model script:game38` on those runs: purchases agree 52–69%, army 58–86%, both 31–45% (game 38: 51 / 95). The model wins about as often on this sample but takes twice as long and dribbles; that is the model's share, and it is the strategy's slack that absorbs it. Wilson intervals at 5 and 11 games overlap (38–96 vs 60–98), so the win rates do not separate; the minutes and pushes do.

**Fidelity (2026-09-14, `bin/oracle.mjs`, free).** The script decides twice on every recorded decision — once from the packet the model saw, once from facts built straight from that packet's state (`src/games/ashfall/facts.mjs`, same gameOpts, nothing budgeted away) — so the packet's losses are measured without a model. Over the 18 runs whose packets the script can read (58–74, 76): **5,958 decisions, 100% identical orders, every run 100%, zero read errors on either side**. The 31 runs before game 58 predate `--ashfall-guide` and error on both sides (6,302 decisions, `no post/yard`), as they must. The packet does lose information — `F` differs on 4,047 of 5,958 decisions (68%), the `--full-every 5` cadence — but never a decision, because `--ashfall-fields-on-demand` puts `F` back exactly when the gather rule reads it; drop that flag and the same states answer `g idle` without a node id (`test/games/ashfall/facts.test.mjs`). No other layer differs at all, so at the working config the packet is a lossless carrier of this plan — under v1, whose state side mirrored the encoder's shaping; v2 (below) reads 93%.

**Game two (2026-09-15): MicroRTS.** `src/games/microrts/` is the adapter, added with **`git diff src/core` empty** —
X5 is met. The engine dials into a TCP server the adapter opens and blocks on every reply, so the adapter owns the game's
clock; an order is a standing goal the buffer steps one engine action per cycle. Four numbers: **fidelity 100% exact over
716 decisions across 5 runs, 0 read errors** under oracle v1 (36% under v2, below; `bin/oracle.mjs --policy rush`), **298 tokens a packet** (countTokens-calibrated 2026-09-15, divisor 1.28 in `src/games/microrts/calibration.json`; the 3.5 placeholder had said ~120; target was 400), **reaction p50 0.4–0.5 s**, one `refreshMs` — the floor for a 500 ms state cadence — at 55–60 decisions a minute,
and **5 of 5 against `ai.abstraction.WorkerRush`** at $0 (`notes/microrts/games.md`). `bin/oracle.mjs`, `bin/bench.mjs`
and `bin/trajectory.mjs` all run on `--game microrts` with no change of their own; `bin/record.mjs`, `bin/snapshot.mjs`
and `bin/discipline.mjs` are Ashfall-only; `bin/campaign.mjs` counted a draw as undecided until 2026-09-15 (fixed:
a draw is a decided game), so the five games ran from a loop (REQUIREMENTS X5).

Getting there needed one engine patch and four adapter facts, all in `src/games/microrts/remote-game-utt.patch` and
§9b: stock CLIENT mode builds two `UnitTypeTable`s and compares unit types by identity, so **no socket client and no
scripted opponent could ever produce a unit**; `fillWithNones` makes every idle unit look busy, which hid every producer
nine cycles in ten; the engine cancels two units heading for the same cell, even across cycles; and an attack-move at an
occupied cell can never arrive, so a push at their base stood outside it for a thousand cycles. Next for MicroRTS: a
model game on `prompts/microrts/game01-sonnet.md` (never played — the key is Sonnet-only and this was all $0), the
other scripted opponents, and the harvester rule in `policy/rush.mjs` reading standing orders rather than engine action
state. working config is now `--microrts-split-states true --microrts-goal-state true` (campaign 3, 5/5, 1.5–1.9 min).

**MicroRTS model games (2026-09-15, games 16–20, Sonnet on `game01-sonnet.md`): 1 of 5, $0.04–0.30 a game.** At the real
clock (100 ms a cycle) 0 of 4: reaction p50 2.2–3.1 s is 22–31 cycles a decision, the first worker starts at 44–76
(script 0), the barracks lands at 364–404 or never (script 249), the rush at ~320 ends it in 0:41–0:49. API time is
2.0–2.2 s on every config (`--thinking off` no change, `--effort low` −0.9 s reaction, overlap/event-tick no change).
At `--microrts-cycle-ms 300` the same prompt **wins in 6:06** (barracks 280, first Light 452 — the script's numbers):
plan and packet carry the model when its latency is not the clock. Model's share: 3–6 harvesters not two, the builder
re-tasked mid-build twice, one raid ignored. Next: a scripted opening for the first ~250 cycles (Ashfall has
`opening.mjs`), a sticky build in the buffer, then a game02 prompt; the parser now takes `a all wk 2,4` and a multi-id hunt.

**Memory (2026-09-16, core M12): `--memory <chars>` feeds the model's own `n` note back as layer `N`.** Games 21–23 with it,
1 of 3, against 1 of 3 without (18, 24–25), all at 300 ms a cycle, $0.11–0.35 a game. Order churn fell (harvest orders
69/24/14 → 38/12/13, the builder never re-tasked mid-build) at +60 output tokens and +0.3–0.5 s a call, because the model
rewrites the note every call instead of answering `null`. The win rate did not move: every loss is raiders at d ≤ 6 on
`X` while the model keeps ordering workers, then no bank for a Light. That is a rule the decision does not apply, not a
fact it forgot — memory is not the bottleneck against WorkerRush; the script's opening is. `replay`, `oracle` and
`trajectory` reproduce `N` from the call row's `memory`. Open: make the model answer `null` when the note is unchanged
(prompt or a cheaper schema), and the commander split — script reflexes at 0 ms, the model adjusting the plan's
parameters with its note on a slower clock (`notes/microrts/games.md`).

**History (2026-09-16, core M13): `--journal N` (last N decisions → `R`) and `--log N` (last N game triggers → `G`), harness-kept;
`--microrts-foe-events` puts their production in `G`; prompt game03 asks the note for plan/why/doing/expect.** Games 26–28: 0 of 3
at 300 ms, $0.20–0.22. The model keeps the form and tracks its builder, then loses exactly as 22–25: raiders at d ≤ 6 from ~t220
while it orders workers, no Light. Six memory/history games say the loss is rule application inside the decision, not state
across decisions. Probes (games.md, "Why memory did not help"): the model describes N/G/R correctly and, asked in text,
applies rule 5; as the forced tool call it re-judges the raid from its priors ("lone worker, not a push", "d6 borderline")
and inherits the verdict written in its own `why` (`no threats near`), patching the number. Memory must hold facts and intent,
not conclusions. Facts-only note (game04, `plan | doing | expect`): games 32–34 with history ranked below the board 1 of 3
(games 26–31 had `G`/`R` at priority 1 and lost `A`/`B` on a third of their packets — fixed, priority 3). Six clean note games
2/6 vs 1/3 without; every loss is the same t220 raider answered 30–130 cycles late.

**Commander split (2026-09-16, core M14): `--model commander:<policy>` — the script plays every packet at 0 ms from a parameter
set; the API model (`--commander-model`, `--commander-every` ms) rewrites the parameters and its note in the background.**
MicroRTS games 35–37 at the real 100 ms clock: 3 of 3 in 1:18–1:48, $0.08–0.10, reaction 0.5 s; commander 15–19 calls a game.
The model alone at that clock was 0/4. Script baseline vs the rest (games 38–49, $0): `LightRush` 1/3, `HeavyRush` 0/3, `RangedRush` 2/3,
`CoacAI` 0/3 (`notes/microrts/games.md`). Next: the commander on LightRush and RangedRush, where a parameter change could
plausibly flip the game; the `train` unit mix and the last-building push shipped (games 50–61: HeavyRush 1/3 with `hv` or `li,rg`, CoacAI still 0/3 — it wins on closing speed, not production; commander on those bots (games 62–67): 1/3 and 0/3, same as the script; it attacks where the script would hold, restates the rest, never counters a raid the script missed — see `notes/microrts/games.md`. Levers it lacks: a recall/push gate on an empty `defend` radius, `X` distance to the nearest unit not the centroid). `F` feedback layer + `commander02-sonnet.md` (cause/effect per parameter) replayed over 53 recorded calls at $0.32: 28/53 pick a different lever (`defend`/`target` drop, `hv` over a mix vs CoacAI), recall rule still not followed. Live (games 68–73): 1/3, 0/3 unchanged; F cut lever repeats to 4/61, defence never raised before contact vs CoacAI. `commander03-sonnet.md` adds the unit table, counters, timings, opening archetypes (replay: Heavy+Ranged counter set before t550, recall rule still missed); live at 2500 ms (games 74–79) 1/3, 0/3: period below the ~4 s model latency changes nothing and blinds F, keep 5000; counter set ~200 cycles before contact vs CoacAI 3/3 but `train hv` never built a Heavy because the validator dropped train orders to a producing building as `busy` (fixed: the buffer now replaces the standing goal); with the fix (games 80–82) 0/3 but Heavies build; units still sortie alone to `defend` 8 and die, workers sent as chaff, barracks idle broke 21–40% of the game; next lever `workers` 2–3 held or `defend` 3–4. Fable 5.1 as commander (game 85): needs `tool_choice` auto (`isFable`, model.mjs) and `--decision-deadline 30000`; 8.5–20 s per call, loop is serial so only 4 sets landed, same decisions as Sonnet 115 cycles later, loss 1:18 at $0.30; model judgement not the gap at this lag, test it via offline replay or a slower clock; offline replay of game 80 under both (Sonnet $0.15, Fable $1.51): Sonnet repeats its live answers and its unreachable plan, Fable revises at every call (harvesters, pushLight 2 with two Heavies, train li when broke, defend back to 6) — a model difference, untested live; Sonnet at medium/high effort replays the same answers with the same ~330 output tokens per call, effort is not the lever, nor is a think-hard/adapt-your-plan prod (`commander04-sonnet.md`, same answers); live commander05 (games 86/87): Sonnet loss t1029 moving deadlines, Fable at a 400 ms clock loss t1301 but 5 Heavies, 17% idle barracks, first hit on CoacAI's base (10>6 hp); ceiling is the reflex's strung-out push; F fixes after those games: a restated claim that already held stays MET; a set with no decisions yet reports the last window that had them plus `set <n> landed`; area of interest, not scheduled: overlap in-flight commander calls so the period holds under a slow model; raise
`--decision-deadline` for the commander (one 6 s abort); Ashfall's `game38` policy has no params yet. Was: the commander split (script reflexes: harvesters, defence, build; the model sets plan
parameters + note on a slow clock), then script campaigns vs LightRush/HeavyRush/CoacAI to find where the plan itself breaks.

**Oracle v2 (2026-09-15).** The state side is now the full state view, not the encoder's shaping: every unit its own
A entry with its own state, every building its position, F unfolded (`facts.mjs` both games; `encode(input, {full: true})`
/ `--<game>-full true` renders the same view so the invariant test still holds; every shipping config replays byte for
byte). `same` is decision equivalence — both order strings decoded and expanded against the recorded state, effective
command sets compared — not text; layer facts compare order-insensitively. Ashfall 93% over 5,958 (A and compact B on
all 410 lost decisions, F cadence on 294); MicroRTS 36% same / 31% exact over 716, the whole loss A's one-state-per-cluster
fold (`notes/microrts/games.md` for the two `--diff` cases).

**Oracle v3 (2026-09-15, later).** `bin/oracle.mjs --arm <--<game>-* flags>` re-encodes the packet side from the recorded
inputs under overlaid gameOpts with the recorded budget (replay's exact assemble call; an empty arm reproduces the
non-arm numbers, asserted in tests), so a packet flag is scored offline against existing recordings before any live game.
X is unfolded on the state side too (per-entity cell, id, dB/dA; `full` renders the same). Numbers: Ashfall 92% over
5,958; per-layer ablation against the unshaped view: A 415, X 108, B 0, F 0, budget/cadence 0 — compact B was
co-attributed on every lost decision and causal on none, and `--ashfall-fields-on-demand` puts F back exactly where the
gather rule reads it. Of the 67 decisions X's unfold costs Ashfall, 39 are a target moving from centroid to cell, 20 are
Army 1 reading a cluster's `n` (a rule written against the fold, now inexpressible — fix the rule to count within r), 8
are a raider the fold had hidden. MicroRTS 34% same / 28% exact (A 456, X 71); **`--microrts-split-states true`
(A clusters by type and state) reads 58% / 51% at +9 tokens a packet**, the remainder positional (which idle worker a
centroid sorts nearest). **Its live gate failed: campaign 2 went 2 of 5** (games 6–10) — first Light 474 vs 434 in
every game, harvester node swaps 49–84 vs 12–32. The fold had been stabilizing the policy's harvester rule by accident
(a walking harvester reads `m`; two walkers on one centroid sort by id). Fidelity is not quality: the oracle's reference
side churns the same way, and per-decision equivalence cannot see a standing order across decisions. The fix is
`--microrts-goal-state` (the unit's standing order from the buffer as its A state, `goal` recorded on every unit).
**Campaign 3 with both flags: 5 of 5 in 1.5–1.9 min** (games 11–15; campaign 1 was 2:24–2:36), harvest orders 6–13 a
game against 165–206, node swaps 1 against 12–32; fidelity on those recordings 89% same / 64% exact over 471 (64% with
`--arm --microrts-goal-state false`). Both flags are MicroRTS's working config (`notes/microrts/README.md`). Pre-existing and unrelated: `runs/ashfall-43..57` do not replay byte for byte (`L` carries
`dropped:noore` entries replay does not reproduce, shifting F/M under the budget); 58 on hold. The replay gate is 58+.

## Working config

```
node bin/pilot.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game55-sonnet.md --packet-max 1000 \
  --full-every 5 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true \
  --ashfall-keep-remembered true --ashfall-lang true --ashfall-search-fields true --ashfall-guide true --ashfall-plan-marks true --overlap 2 --event-tick --stream \
  --max-usd 2 --concede-on budget --stop-file /tmp/qd-stop --ashfall-concede-stale true
```
The script plays the same line with `--model script:game38` and no `--prompt`/`--stream` (it reads the raw facts, so the marks are inert for it). game55 + marks adopted after game 55 (one live win on the bench gate; the marks themselves have not yet fired live). All flags are off by default so old runs replay byte for byte.

| flag | what it does | gated by |
|---|---|---|
| `--full-every 5` | fields and remembered on one packet in five; packet 720 → 430 tokens | games 17–19 |
| `--ashfall-fold-fields` | unexplored fields on one `f?` line, positions kept | game 17 |
| `--ashfall-fields-on-demand` | `F` on every packet while a harvester is idle or a field is dry (gather needs a node id) | game 20: blind gathers 24 → 0 |
| `--ashfall-no-note` | schema without `note`; output 121 → 89 | game 23 |
| `--memory <chars>` (core) | the model's `n` note fed back as layer `N` on the next packet; M12 | MicroRTS games 21+ |
| `--journal N` `--log N` (core) | harness-kept history: last N decisions as `R`, last N game triggers as `G`; M13 | MicroRTS games 26+ |
| `--model commander:<policy>` (core) | the policy answers every packet at 0 ms from a parameter set; an API model rewrites the set in the background every `--commander-every` ms (`--commander-model <id>`); packet to the commander carries `F` (its last parameter set, decisions in force, how many reflex orders it changed, and — where the policy exports `measure(packet)` — its own `plan` line beside the grade of the `expect` it set: MET/MISSED/pending with the best value seen, plus claim history — since/best carried and `by`/`value` moves counted — when the same metric/op is restated); M14 | MicroRTS games 35–37, 3/3 |
| `--script-params <json>` (core) | overrides the policy's DEFAULTS for a script arm: a fixed commander setting at $0 | MicroRTS games 50+ |
| `--microrts-foe-events` | a new enemy unit is an info event, so `G` carries their production | games 26+ |
| `--ashfall-compact-buildings` | one always-on `B` line: ids, types, anchor positions, hp/bld only when hurt or unfinished | bench: equals the full packet at 39% of its tokens |
| `--ashfall-keep-remembered` | `M` on every packet at army priority (game 25: the enemy base reached the model on 1 packet of 118) | trajectory: pushTarget 22/25 vs 1/14 |
| `--ashfall-lang` | one string out, decoded by `lang.mjs`; output 88 → 46, reaction 5.6 → 3.7 s | bench 98%, game 25 |
| `--ashfall-search-fields` | `M` names the search waypoint while 8+ riflemen have no listed target | bench search 10/10, games 32–33 |
| `--ashfall-guide` | `wk N tr N` on `H`, `post@`/`yard@`/`(no tu)` on `B`, `out` marks, mirror-first waypoint, no `hb` on `T` | bench 68% → 92%, game 38 |
| `--ashfall-plan-marks` (with guide, prompt game55) | `out failed` on a rally under 5 riflemen, `(2nd ba)` on `B` when Buy 5 holds | bench failed 0→4/5, secondba 0→3/5; game 55 win 4:54 (neither mark fired) |
| `--packet-max 1000` | a rail, not a shaping tool (the 600 default cut nothing useful) | game 25 replay |
| `--overlap 2` | a ranked trigger may start a second call while one is in flight; reaction 3.7 → 2.5 s | game 27 (26 was the defect run) |
| `--event-tick` | decide on event arrival on the latest state; event wait 0.49 → 0.18 s | game 28 |
| `--stream` | each command sent as its `;` closes; first order 0.6 s earlier on multi-command answers | game 30 |
| `--overlap 3`, `--reserve danger,contact,loss` | inside one game's noise / did its job but the opening starved; both off, A/B candidates | games 29, 31 |
| `--thinking off`, `--reply text` | worse (longer output; the model narrates without the tool) | games 22, bench |

## Measurement (offline unless stated)

| tool | question | cost |
|---|---|---|
| `bin/pace.mjs <run…>` (`--row N`) | pace, latency split, tokens, cache, cost; the games.md row | free |
| `bin/replay.mjs <run> all` | encode is pure over the recorded refs (byte for byte) | free |
| `bin/replay-commander.mjs <run> --prompt f [--dry-run]` | a commander run's launches replayed against a prompt/model: reconstructed F(+O) line, per-call param diffs, lever counts | free (`--dry-run`); ~model cost per call otherwise |
| `bin/layers.mjs`, `bin/classes.mjs`, `bin/discipline.mjs <run…>` | tokens per layer; what each trigger class buys; rule adherence of a live game | free |
| `bin/bench.mjs [arm] --repeats 5 --out a.json`; `--compare`; `--rescore` | decision quality on 13 fixed states (`test/games/ashfall/bench/cases.mjs`) | ~$0.20 an arm; `--model script:game38 --repeats 1` free |
| `bin/trajectory.mjs <run> [--every k] [arm] --out a.json`; `--compare`; `--rescore` | a recording re-decided under one arm: agreement with the recording, ten per-decision rules; with `--model script:<name> --diff`: Buy/Army agreement per decision and every disagreement printed with its packet | ~$0.006 a decision; script free |
| `bin/sensitivity.mjs [arm] --repeats 5 --out dir` | the bench with one layer removed, per layer | ~$1.30; script free |
| `bin/comprehend.mjs --prompt f --cases f [--set] [--context case\|front\|back\|all] [--why]` | does the model read the prompt: one fact per call, a section alone, inside its half, inside the whole; `--why` makes it cite the line | ~$0.25 a rung at 8 repeats |
| `bin/campaign.mjs --games N [--ab flag=value] -- <pilot flags>`; `--report` | N live games, A/B alternating, resumable, games.md rows, per-arm win rate with a Wilson interval | ~$1 a game; $0 with the script |
| `bin/oracle.mjs <run…> [--every k] [--diff] [--out f.json]` | packet fidelity: the scripted policy decided from the recorded packet vs from the raw state; agreement rate, per-layer facts differences, and which layer each disagreement came from | free |
| `bin/snapshot.mjs <run> --n N --out f.json`, `bin/rehearse.mjs` | a scrubbed fixture from a recorded state; the older fixed-state A/B | free / ~$0.02 a call |

Timing levers (overlap, event tick, stream) cannot be measured offline; one live game, read with `pace`. Runs from game 24 on are complete captures (prompt, schema, every state, packet, raw response, latency split, every result).

## Facts that steer

- **Noise floor**: the same config replayed on itself agrees with its recording on command kinds 54% of the time. Compare arms on rates; under ~15 points at 84 decisions is noise; bench cases need 5 repeats (the script needs 1).
- **Output floor**: out ≈ 29 + 0.69 × chars of `o`; the 29 is the tool framing and it is what suppresses narration. Closed.
- **Packet content is at its floor**: removing any layer costs more than the day-to-day drift. The remaining packet lever is encoding density, now testable for free: what the script reads is necessary, what it never reads is a drop candidate.
- **Trigger contention**: economy triggers are 34–38% of calls at 40% no-op; with two slots half the danger/contact/loss triggers coalesce behind economy and done calls. `--reserve` fixes that share and starves the opening; undecided.
- **Model vs plan (game 38)**: army 95%, purchases 51%; the misses are purchases not made. Whether that costs games is what the script's live record will say.

## Next, in order

0. **MicroRTS commander: see Current aim at the top.** The items below are the Ashfall-era list, still open but not the active line of work.

1. **The model's departures, read and half closed (2026-09-14 night, all offline).** `trajectory --model script:game38 --diff` on runs 70–74 with a 6-decision window (the script re-issues standing orders every packet; the model says them once; `buyAgreeW`/`armyAgreeW`): purchases 64–84%, army 63–88%. The residue is four compound rules the model skips: rally out with under 5 riflemen (never recalled: 120 packets in game 52), a cluster out while the rally is home (81), the second barracks at 200 ore with every queue full (never built: 107), a raid at home the riflemen outnumber (21); plus one decisive stochastic one, the commit with 8 on a kill packet (game 50 at 2:46). Three new bench cases from those states: `sally`, `secondba`, `failed`. Sonnet on the game38 packet: sally 5/5 (does not reproduce offline), secondba 0/5, failed 0/5. `--ashfall-plan-marks` puts the two compound conditions where their rule reads them (`out failed` on the rally, `(2nd ba)` on B): with the game38 prompt still 0/5 and 0/5 (a mark the prompt does not name is ignored); with `game55-sonnet.md` (game38 plus four lines naming them) failed 4/5, secondba 3/5, the full 16 cases 86% with the same two old misses (`train`, `remembered` 1/5). Arm files `runs/bench/2026-09-14-game55-*.json`, `…-departures-*.json`. **Game 55 (hub 76), the first live game on game55 + marks: win in 4:54, $0.61**, the model's fastest and closest to the plan (first push 16 at 4:06, 10 pushes, ore p50 45; windowed agreement purchases 79%, army 93% against 64–84 / 63–88 in games 50–54). One game, and **neither mark fired in it** (no packet carried `(2nd ba)` or `out failed`: ore never sat at 200 with a full queue and the attack never failed), so the win confirms the prompt's four lines do no harm, not that the marks work live; that needs a game that enters those states. The working config adopts game55 + marks on the bench gate. The second barracks is the open bench miss (3/5): the model attacks the visible core and buys nothing.
2. **Longer campaigns only when a change needs them**: 10 games an arm gives ±26 points; the script arm is free, the model arm ~$1.40 a game (its games run long). Note the model's games grew through the evening (5.4 → 14.6 min, reaction p50 2.1 → 2.5 s) while the hub was stuttering (`ashfall_sector/requests/2026-09-14-live-hub-stutter.md`): rerun one model game after the hub fix before reading the minutes as the model's.
3. **Deterministic sensitivity**: `sensitivity.mjs --model script:game38`; then instrument `read.mjs` to log which fields the policy touched per decision and drop what it never reads.
4. **The harness's own scoreboard, per game**: fidelity (`oracle`, decision equivalence of script(packet) vs script(state)), tokens per packet at that fidelity (`layers`), the reaction floor with the script in the seat (`pace` on a script game), and the core diff on a second game (X5, zero). A packet change is gated on the oracle staying at 100% before the bench. The second game is the open item; model campaigns on Ashfall are done unless a harness change needs one.
5. ~~Oracle v2, the state side unbudgeted~~ shipped 2026-09-15; v3 (`--arm`, X unfolded, per-layer ablation) the same day (State above). Open from it: Ashfall's A loss is 415 decisions, mostly the centroid-to-cell target and Army 1's cluster-`n` test — fix the rule, or give equivalence a same-entity target tolerance; an Ashfall A split-states arm can now be scored offline with `--arm` before a live game; the 43–57 replay divergence.
6. Small, open: the `L` layer still prints the old wording, not the order language; short per-game ids; the `search` second step untested live; `T placed ba#N` can arrive before `B` lists it (event tick on an older state; game 38 n=2), so a per-packet script re-issues the build and the repeat check drops it.

## Environment

- `.env` (gitignored): `ANTHROPIC_API_KEY` (**Sonnet only**), `ASHFALL_HUB` (wss://…), `ASHFALL_KEY`. `ASHFALL_LOCAL=~/workspace/ashfall_sector` enables the local-hub tests and fixture capture. `runs/` and `*.jsonl` are ignored except test fixtures.
- Live game ≈ $0.13 per game-minute on the working config, 5–15 minutes a game; `--max-usd 2 --concede-on budget` ends a long one. The script costs nothing but the hub seat.
- Hub games on the account are listed at the end of `notes/ashfall/games.md`; a run cut at start is conceded stale by the next run.

## Commands

```
npm test
node bin/pilot.mjs --game mock --model none
ASHFALL_LOCAL=../ashfall_sector npm run test:ashfall
ASHFALL_LIVE=1 ASHFALL_CONCEDE_STALE=1 node --test test/games/ashfall/live.test.mjs      # live checklist, concedes leftovers
node bin/pace.mjs --row 39 runs/ashfall-59.jsonl
node bin/bench.mjs --model script:game38 --repeats 1 --slim --packet-max 1000 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true --ashfall-keep-remembered true --ashfall-lang true --ashfall-search-fields true --ashfall-guide true   # the strategy as code on the bench, free; swap in --model claude-sonnet-5 --prompt prompts/ashfall/game38-sonnet.md --repeats 5 for the model arm (~$0.20)
node bin/trajectory.mjs runs/ashfall-58.jsonl --every 1 --model script:game38 --diff --out runs/traj/58-script.json   # model vs plan, per decision, free
node bin/campaign.mjs --games 10 -- --game ashfall --model script:game38 --packet-max 1000 --full-every 5 --ashfall-fold-fields true --ashfall-fields-on-demand true --ashfall-no-note true --ashfall-compact-buildings true --ashfall-keep-remembered true --ashfall-lang true --ashfall-search-fields true --ashfall-guide true --overlap 2 --event-tick --stop-file /tmp/qd-stop --ashfall-concede-stale true   # the strategy's win rate, $0
node bin/replay.mjs runs/ashfall-58.jsonl all
node bin/discipline.mjs runs/ashfall-58.jsonl runs/ashfall-59.jsonl
node bin/sensitivity.mjs --model script:game38 --repeats 1 --slim --packet-max 1000 <working packet flags> --out /tmp/sens
node bin/snapshot.mjs runs/ashfall-58.jsonl --n 191 --out test/games/ashfall/bench/fixtures/name-tNNN.json
```

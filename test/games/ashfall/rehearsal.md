# Ashfall rehearsal scores

Hand scores for `node bin/rehearse.mjs --game ashfall --model claude-sonnet-5 --prompt prompts/ashfall/game12-sonnet.md --every 3` (16 fixture moments, every third fixture from t=0 to t=229). Legal = every sent order passed validate and would be accepted; sensible = a competent player might give it; hidden = what the packet hid that the model needed. Raw output in `runs/rehearsal-N-sonnet.txt` (gitignored). Only Sonnet is checked: the key is Sonnet-only.

## Run 1 (2026-09-12): all 16 calls 400
The strict `orders` schema did not compile ("compiled grammar is too large"). Cause: `units` items typed `integer|string` across 11 variants. Fix: ids are strings only (`tool.mjs`); enums, nullables, `note` and `disband` all fit once that union is gone.

## Run 2 (2026-09-12): prompt before the vocabulary fixes
16 calls, median latency 2268 ms, median output 156 tokens, cache 15/16 (prefix 8223 tokens), $0.09. Legal 11/16, sensible 13/16. Two vocabulary gaps caused every illegal order: the model pasted cluster labels (`"tr x4"`, `"tr x5@39,1"`) as unit ids (5 × bad-id) and used `"idle"` for harvesters in `build` (server: no harvesters). Once it `stop`ped `all`, which halts mining. Fixes: `expand` now resolves a pasted cluster label to the ids of that type within 8 of the point and `idle` in `workers` to idle harvesters; the prompt says so and forbids `all` for stop/move.

## Run 3 (2026-09-12): prompt sha aad4417a3113
16 calls, median latency 2752 ms, median output 120 tokens, cache 15/16 (prefix 8384 tokens), $0.089. **Legal 16/16** (nothing illegal reached send; validate dropped `capped`/`queue-full` trains before the wire). Sensible 14/16.

| fixture | t | orders | legal | sensible | notes |
|---|---|---|---|---|---|
| 001 | 0 | train wk ×2; build ba (dropped noore) | yes | yes | barracks at 150 ore after 2 workers is short 70: validate caught it, the plan is right |
| 004 | 16 | act:false | yes | yes | barracks building |
| 007 | 31 | act:false | yes | yes | |
| 010 | 46 | train tr ×2 | yes | yes | |
| 013 | 62 | build dp (capped) | yes | yes | |
| 016 | 77 | train tr ×2 (dropped capped) | yes | no | capped and no depot ordered; the prompt now says one depot first |
| 019 | 93 | build dp | yes | yes | |
| 022 | 108 | rally 58,4; move 4 tr there | yes | yes | anchor set on the map-centre side |
| 025 | 123 | train tr ×2; build tu 58,4 | yes | yes | |
| 028 | 139 | stop 6 tr | yes | yes | guard order at the anchor |
| 031 | 154 | train tr ×2 | yes | yes | enemy wk sighted, no chase: good |
| 034 | 169 | build tu 63,10; move 8 tr; rally | yes | yes | second anchor, arguable but coherent |
| 037 | 184 | build dp; train ×2 dropped capped | yes | yes | |
| 040 | 199 | rally; attack-move 11 tr to 58,8; 5 trains dropped | yes | no | wave of 7 tr at -9,-1 in vision; ball moves to the anchor, which is right, but 5 capped trains show it does not read CAPPED |
| 043 | 214 | build dp | yes | yes | |
| 046 | 229 | rally; attack-move 8 tr in two groups; 3 trains dropped | yes | yes | |

Hidden: nothing the model asked for was missing. Recurring flaw: training while `CAPPED` (harmless: dropped client-side, 0 wire cost) and a depot re-ordered each decision because fixtures are static and the previous build never "takes"; in a live game the `repeat` suppressor and `B` layer cover it. Cost per decision ≈ $0.0056 at 8.4k cached prefix + ~430 est packet + 120 output tokens.

## Numbers for game 12
- Calibrated divisor 1.34 chars/token (`calibration.json`, 12 packets, 7507 chars = 5602 tokens). A full packet is 350-600 est tokens; the fields layer drops first at 600.
- `input_tokens` on a cache-hit call ≈ packet est + ~200 (message and forced-tool framing); `pace` reports the raw number.
- Median model latency 2.3-2.8 s at thinking adaptive / effort low: inside the 3 s target, no output trimming needed before going live.

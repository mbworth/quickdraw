// Comprehension cases for prompts/microrts/commander08-sonnet.md, one question per prompt section.
const hasAll = (a, words) => { const s = a.toLowerCase(); return words.every(w => s.includes(w)); };
const hasLetters = (a, letters) => letters.every(l => new RegExp(`(^|[^A-Za-z])${l}([^A-Za-z]|$)`, 'i').test(a));

export default [
  // Role
  { name: 'role-hands-or-commander', sections: ['Role'], q: 'Are you the hands or the commander?', expect: /commander/i },
  { name: 'role-sees-every-packet', sections: ['Role'], q: 'True or false: you see every packet the reflex acts on.', expect: /false/i },

  // Tokens
  { name: 'tokens-worker', sections: ['Tokens'], q: 'What is the packet token for a Worker?', expect: 'wk' },
  { name: 'tokens-hv7', sections: ['Tokens'], q: 'What does `hv#7` refer to?', expect: /heavy.*7/i },
  { name: 'tokens-y-direction', sections: ['Tokens'], q: 'Which way does y run, up or down?', expect: /down/i },

  // The board
  { name: 'board-enemy-base', sections: ['The board'], q: 'At what position does the enemy base start?', expect: /13,\s*13/ },
  { name: 'board-node-count', sections: ['The board'], q: 'How many resource nodes are on the map in total?', expect: '4' },

  // Units
  { name: 'units-hv-cost', sections: ['Units'], q: 'How many ore does a `hv` cost?', expect: '3' },
  { name: 'units-br-build-li', sections: ['Units'], q: 'How many cycles does a `br` take to build a `li`?', expect: '80' },
  { name: 'units-rg-range', sections: ['Units'], q: 'What is the range of a `rg`?', expect: /\b3\b/ },

  // Swings to kill
  { name: 'swings-hv-vs-li', sections: ['Swings to kill'], q: 'How many swings does a `hv` need to kill a `li`?', expect: '1' },
  { name: 'swings-wk-vs-ba', sections: ['Swings to kill'], q: 'How many swings does a `wk` need to kill a `ba`?', expect: '10' },
  { name: 'swings-who-kills-li', sections: ['Swings to kill'], q: 'Which unit types kill a `li` in one swing?', expect: a => /\bhv\b/i.test(a) && !/\b(rg|wk|li)\b/i.test(a) },
  { name: 'swings-rg-on-li', sections: ['Swings to kill'], q: 'How many swings does a `rg` need to kill a `li`?', expect: '4' },
  { name: 'swings-rg-range', sections: ['Swings to kill'], q: 'From how many cells away does `rg` attack?', expect: '3' },

  // Timings on this map
  { name: 'timing-base-to-base-steps', sections: ['Timings on this map'], q: 'How many steps is base to base on this map?', expect: /\b22\b/ },
  { name: 'timing-coacai-hv-rg', sections: ['Timings on this map'], q: 'By what cycle does CoacAI have hv and rg, per past games?', expect: /554/ },

  // Engine facts
  { name: 'engine-attack-move-building', sections: ['Engine facts'], q: 'What does an attack-move do when it targets an occupied cell such as a building?', expect: /stops one step short/i },
  { name: 'engine-push-recall', sections: ['Engine facts'], q: 'True or false: a launched push can be recalled at any time.', expect: /false/i },

  // The packet
  { name: 'packet-worker-count', sections: ['The packet'], q: 'In the layer entry `wk x2@4,2 m #40,#51`, how many Workers are there?', expect: '2' },
  { name: 'packet-worker-state', sections: ['The packet'], q: 'In the layer entry `wk x2@4,2 m #40,#51`, what state are they in?', expect: /^`?m`?$|mov/i },
  { name: 'packet-x-distance', sections: ['The packet'], q: 'In an `X` entry `li x1@3,4 d3/1 #45`, how many steps is the unit from your base?', expect: '3' },
  { name: 'packet-letter-then-entries', sections: ['The packet'], q: 'Which five layer letters are printed as a letter alone on its own line, followed by one entry per line beneath it?', expect: a => hasLetters(a, ['E', 'A', 'X', 'G', 'R']) },
  { name: 'packet-l-refusal-reason', sections: ['The packet'], q: 'In `L t 20 wk ok; h #22 #16 busy`, why was the second order refused?', expect: /busy|producing/i },
  { name: 'packet-none-meaning', sections: ['The packet'], q: 'A packet line reads `E none`. What does that tell you about the E layer?', expect: /empty|nothing|no (resource|node|entr)/i },

  // O lines
  { name: 'oline-near-threshold', sections: ['O lines'], q: 'According to `O near:`, within how many steps must a Light, Heavy or Ranged cluster be (before any worker) to count as near?', expect: '12' },
  { name: 'oline-foe-barracks-window', sections: ['O lines'], q: 'Up to what cycle does `O foe:` report the first cycle their barracks was seen?', expect: /600/ },

  // Memory
  { name: 'memory-max-length', sections: ['Memory'], q: 'What is the maximum length, in characters, of your N note?', expect: '300' },
  { name: 'memory-format', sections: ['Memory'], q: 'What two labeled fields does your N note format use, separated by `|`?', expect: a => hasAll(a, ['seen', 'doing']) },

  // Your call
  { name: 'call-defend-default', sections: ['Your call'], q: 'What is the default value for `defend`?', expect: '6' },
  { name: 'call-pushlight-heavy', sections: ['Your call'], q: 'Does `pushLight` count Heavy units toward its trigger?', expect: /yes/i },
  { name: 'call-train-lever', sections: ['Your call'], q: 'Which lever chooses what the barracks builds?', expect: /train/i },
  { name: 'call-pullback-lever', sections: ['Your call'], q: 'Once a push has launched, which lever can still pull units back?', expect: /defend/i },
  { name: 'call-group', sections: ['Your call'], q: 'With `group` at 2, what does an army unit 5 steps from the largest cluster do when the push fires?', expect: /join|walk|toward|to the cluster|rejoin|gather/i },
  { name: 'call-engage', sections: ['Your call'], q: 'With `engage` at 2, one free army unit, and an enemy at d4 (inside `defend` 6, outside `panic` 2): does that unit go out or hold the post?', expect: /hold/i },
  { name: 'call-required-fields', sections: ['Your call'], q: 'Besides the levers, what are the two fields every tool call carries for your plan?', expect: a => hasAll(a, ['steps', 'why']) },

  // Feedback
  { name: 'feedback-orders-differed', sections: ['Feedback'], q: 'What does `orders differed 0/5` mean?', expect: /same|identical|n.t.*shown|no.*effect|unchanged|not.*played/i },
  { name: 'feedback-example-differed', sections: ['Feedback'], q: 'Given the line `F set 3 in force 5 decisions: defend 6>4 | orders differed 2/5 | last: a #5 3,3 ok / was m #5 3,3 ok`, in how many of the 5 decisions did the reflex issue orders different from what the old set would have given?', expect: '2' },
  { name: 'feedback-f-none', sections: ['Feedback'], q: 'What does `F none` mean?', expect: /first|before|no (parameter|set|prior|previous|feedback)|not.*(yet|before)/i },
];

// Composite: two or more sections; reading only, no arithmetic (the harness computes counts, sums and grades).
const U = 'O units: my li x2 vs their li x3 | li 4hp 2dmg cost 2 80c: kills wk 1 swing, li 2, hv 4, rg 1 | hv 8hp 4dmg cost 3 120c: kills wk 1, li 1, hv 2, rg 1 | rg 1hp 1dmg range 3 cost 2 100c: kills wk 1, li 4, hv 8, rg 1';
const TR = 'O trig: pushLight 3: my army 2 (+1 in last 100c); barracksAt 3: my wk 5, br 1; defend 6/panic 2: their nearest mobile d3, inside defend';
const HM = 'O home: my army 3: 3 within d6 of my base; my wk 5 at base; their nearest mobile d5';
const EC = 'O econ: my bank 1 (0 committed); mined +2/99c, spent 2/99c; ba#20 idle 99/99c, br#29 idle 80/99c; most idle ba#20';
const PU = 'O push: my army 3 nearest d12 to their ba@13,13, was d9 @t1314; orders last 100c: 1 at their ba, 11 between';
export const composite = [
  { name: 'c-token-cost', sections: ['Tokens', 'Units'], q: 'How many ore does a Heavy cost?', expect: '3' },
  { name: 'c-x-vs-board', sections: ['The board', 'The packet'], q: 'An `X` entry reads `ba x1@13,13 d22/24 #21`. Is this your base or theirs?', expect: /their|enemy|not (mine|yours)/i },
  { name: 'c-b-vs-x', sections: ['The packet'], q: 'Their barracks stands at 12,13. Which layer letter will it appear under, `B` or `X`?', expect: /^`?x`?$|\bX\b/ },
  { name: 'c-lever-for-unit', sections: ['Units', 'Your call'], q: 'You want the barracks to produce Heavy units instead of Light. Which lever do you set, and to what value?', expect: a => /train/i.test(a) && /\bhv\b/i.test(a) },
  { name: 'c-units-who-kills-li', sections: ['Tokens', 'O lines'], q: `The packet carries \`${U}\`. Which of your unit types kills a \`li\` in one swing?`, expect: /^`?hv`?$|heavy/i },
  { name: 'c-units-outnumbered', sections: ['Tokens', 'O lines'], q: `The packet carries \`${U}\`. Do they have more combat units than you?`, expect: /^yes/i },
  { name: 'c-units-li-vs-hv', sections: ['Tokens', 'O lines'], q: `The packet carries \`${U}\`. How many swings does a \`li\` need to kill a \`hv\`?`, expect: '4' },
  { name: 'c-trig-push', sections: ['O lines', 'Your call'], q: `The packet carries \`${TR}\`. Has the pushLight trigger been reached?`, expect: /^no\b/i },
  { name: 'c-trig-defend', sections: ['O lines', 'Your call'], q: `The packet carries \`${TR}\`. Is their nearest mobile unit inside your defend radius?`, expect: /^yes/i },
  { name: 'c-trig-panic', sections: ['O lines', 'Your call'], q: `The packet carries \`${TR}\`. Is their nearest mobile unit inside or outside your panic radius?`, expect: /outside/i },
  { name: 'c-home-out', sections: ['O lines', 'Your call'], q: `The packet carries \`${HM}\`. How many of your army units are outside your defend radius?`, expect: /^0$|none|zero/i },
  { name: 'c-econ-idle', sections: ['O lines', 'Your call'], q: `The packet carries \`${EC}\`. Which building was idle the most in the last window?`, expect: /ba|base/i },
  { name: 'c-push-dist', sections: ['Tokens', 'O lines'], q: `The packet carries \`${PU}\`. How many steps is your nearest army unit from their base now?`, expect: /(^|\D)12(\D|$)/ },
  { name: 'c-push-was', sections: ['Tokens', 'O lines'], q: `The packet carries \`${PU}\`. How many steps was your nearest army unit from their base about 100 cycles earlier?`, expect: /(^|\D)9(\D|$)/ },
  { name: 'c-push-between', sections: ['Tokens', 'O lines'], q: `The packet carries \`${PU}\`. In the window, how many reflex packets sent your army to a point that is neither their building nor your base?`, expect: /(^|\D)11(\D|$)/ },
  { name: 'c-push-at-ba', sections: ['Tokens', 'O lines'], q: `The packet carries \`${PU}\`. In the window, how many reflex packets sent your army at their base?`, expect: /(^|\D)1(\D|$)/ },
  { name: 'c-push-closer', sections: ['Tokens', 'O lines'], q: `The packet carries \`${PU}\`. Is your nearest army unit closer to their base now than it was about 100 cycles earlier? Answer yes or no.`, expect: /^no\b/i },
  { name: 'c-f-grade', sections: ['Your call', 'Feedback'], q: 'The packet carries `F set 4 in force 6 decisions: train li>hv | orders differed 3/6 | plan: heavies vs their lights | expect hv>=2 by t900: MISSED (max 1) | last: t 29 hv / was t 29 li`. Did your last plan reach its expect?', expect: /^no\b|missed/i },
  { name: 'c-f-took-effect', sections: ['Your call', 'Feedback'], q: 'The packet carries `F set 4 in force 6 decisions: train li>hv | orders differed 3/6 | plan: heavies vs their lights | expect hv>=2 by t900: MISSED (max 1) | last: t 29 hv / was t 29 li`. Has your change to train shown up in the reflex orders yet?', expect: /^yes/i },
  { name: 'c-note-content', sections: ['Memory', 'Your call'], q: 'Which of these belongs in the N note: (a) "no threats near", (b) "hv 2 at 3,3, defend 6", (c) "they are winning"?', expect: /\bb\b/i },
];

// Probes: no scorer, read the answers. Run with --set probe --context all.
export const probe = [
  { name: 'p-objective', sections: ['Role'], q: 'What is your objective?' },
  { name: 'p-purpose', sections: ['Role'], q: 'What is your purpose in this system, and what is the reflex for?' },
  { name: 'p-win', sections: ['Role'], q: 'How is the game won?' },
  { name: 'p-control', sections: ['Role'], q: 'What do you control, and what do you not control?' },
  { name: 'p-good-call', sections: ['Role'], q: 'What does a good call from you look like?' },
];

// Reading a real packet (game 191 call 4, --message <file>): no scorer. Run with --set call4 --context all --message runs/...call4.txt.
export const call4 = [
  { name: 'k-their-army', sections: ['Role'], q: 'What is their army, by type and count, and how far is it from your base?' },
  { name: 'k-my-army', sections: ['Role'], q: 'What is your army, by type and count?' },
  { name: 'k-counter', sections: ['Role'], q: 'Which of your unit types kills a `li` in one swing?' },
  { name: 'k-barracks', sections: ['Role'], q: 'What is your barracks doing right now, and what is `train` set to?' },
  { name: 'k-idle', sections: ['Role'], q: 'Which building idled most in the last window, and what does that tell you?' },
  { name: 'k-trigger', sections: ['Role'], q: 'How many combat units do you have, and how many does `pushLight` need before the reflex attacks?' },
  { name: 'k-f', sections: ['Role'], q: 'What does `F` say about your last plan?' },
  { name: 'k-beats', sections: ['Role'], q: 'Their army is 3 `li`. Which of your unit types beats a `li` in a fight, and which lever and value would make your barracks build that type?' },
  { name: 'k-when-train', sections: ['Role'], q: 'What would have to be true for you to change `train` away from `li`?' },
  { name: 'k-one-lever', sections: ['Role'], q: 'If you changed exactly one lever now, which one, to what value, and why?' },
];

// Inertia or matching: the call-4 packet, its standing `train` or their army edited (--message). No scorer.
export const train = [
  { name: 't-set-train', sections: ['Role'], q: 'What do you set `train` to on this call, and why?' },
  { name: 't-one-lever', sections: ['Role'], q: 'If you changed exactly one lever now, which one, to what value, and why?' },
];

// O lines combed: real lines from game 194, one field per question.
const n = v => new RegExp(`(^|\\D)${v}(\\D|$)`);
const NO = /^no\b/i, YES = /^yes\b/i;
const OL = ['Tokens', 'O lines'];
const carry = (line, q) => `The packet carries \`${line}\`. ${q}`;
const NR = 'O near: their li x2 @14,9 d19 to my base, was d11 @t1164';
const HO = 'O home: my army 5: 0 within d6 of my base, 5 at d11-17; my wk 3 at base; their nearest mobile d19';
const HN = 'O home: my base gone; my army 2; my wk 5; their nearest mobile d8';
const RE = 'O reach: foe_br==0 by t1500: their br 1, no change since t1194';
const TG = 'O trig: pushLight 4: my army 3 (0 in last 100c); barracksAt 3: my wk 4, br 1; defend 6/panic 2: their nearest mobile d12, outside defend';
const FO = 'O foe: their br 1; their wk 1 (peak 1); their li 2 (peak 3, +1 since t1114)';
const FI = 'O fight: t1274-1339 @12,8: lost my li x2 wk x2, killed their li x2; t1379-1399 @11,8: lost my li x1 wk x1';
const GO = 'O gone: their br#25 since t1500; their li 0 since t1600 (peak 3)';
const EO = 'O econ: my bank 2 (2 committed); mined +2/100c, spent 1/100c (wk 1); ba#20 idle 65/100c, br#29 idle 100/100c; most idle br#29';
const PB = 'O push: my army 2 nearest d18 to their ba@13,13, was d19 @t1649; orders last 95c: 4 between, 7 at my base';
export const olines = [
  { name: 'o-near-dist', sections: OL, q: carry(NR, 'How many steps is their nearest cluster from your base now?'), expect: n(19) },
  { name: 'o-near-was', sections: OL, q: carry(NR, 'How many steps was that cluster from your base about 100 cycles earlier?'), expect: n(11) },
  { name: 'o-near-count', sections: OL, q: carry(NR, 'How many units are in that cluster?'), expect: n(2) },
  { name: 'o-near-type', sections: OL, q: carry(NR, 'What unit type is that cluster? Answer with the token.'), expect: /li/i },
  { name: 'o-near-nearer', sections: OL, q: carry(NR, 'Is that cluster nearer to your base now than it was about 100 cycles earlier? Answer yes or no.'), expect: NO },
  { name: 'o-home-in', sections: OL, q: carry(HO, 'How many of your army units are within 6 steps of your base?'), expect: /(^|\D)0(\D|$)|none|zero/i },
  { name: 'o-home-out', sections: OL, q: carry(HO, 'How many of your army units are farther than 6 steps from your base?'), expect: n(5) },
  { name: 'o-home-far', sections: OL, q: carry(HO, 'How many steps from your base is your farthest army unit?'), expect: n(17) },
  { name: 'o-home-wk', sections: OL, q: carry(HO, 'How many of your workers are at your base?'), expect: n(3) },
  { name: 'o-home-nobase', sections: OL, q: carry(HN, 'Does your base stand? Answer yes or no.'), expect: NO },
  { name: 'o-reach-count', sections: OL, q: carry(RE, 'How many of their barracks stand now?'), expect: n(1) },
  { name: 'o-reach-by', sections: OL, q: carry(RE, 'What cycle is the deadline of your claim?'), expect: n(1500) },
  { name: 'o-reach-change', sections: OL, q: carry(RE, 'Has the count changed since you set the claim? Answer yes or no.'), expect: NO },
  { name: 'o-trig-army', sections: OL, q: carry(TG, 'How many army units do you have?'), expect: n(3) },
  { name: 'o-trig-change', sections: OL, q: carry(TG, 'By how many did your army count change in the last 100 cycles?'), expect: /(^|\D)0(\D|$)|none|zero|no change/i },
  { name: 'o-trig-met', sections: OL, q: carry(TG, 'Has your army count reached pushLight? Answer yes or no.'), expect: NO },
  { name: 'o-trig-near', sections: OL, q: carry(TG, 'How many steps is their nearest mobile unit from your base?'), expect: n(12) },
  { name: 'o-trig-inside', sections: OL, q: carry(TG, 'Is their nearest mobile unit inside your defend distance? Answer yes or no.'), expect: NO },
  { name: 'o-foe-li', sections: OL, q: carry(FO, 'How many `li` of theirs are alive now?'), expect: n(2) },
  { name: 'o-foe-peak', sections: OL, q: carry(FO, 'What is the most `li` of theirs alive at one time so far?'), expect: n(3) },
  { name: 'o-foe-since', sections: OL, q: carry(FO, 'Since what cycle is the change in their `li` counted?'), expect: n(1114) },
  { name: 'o-foe-br', sections: OL, q: carry(FO, 'How many barracks of theirs stand?'), expect: n(1) },
  { name: 'o-fight-count', sections: OL, q: carry(FI, 'How many fights does the line report?'), expect: /(^|\D)2(\D|$)|two/i },
  { name: 'o-fight-late-where', sections: OL, q: carry(FI, 'At what position was the later fight?'), expect: /11\s*,\s*8/ },
  { name: 'o-fight-late-killed', sections: OL, q: carry(FI, 'How many of their units did you kill in the later fight?'), expect: /(^|\D)0(\D|$)|none|zero|nothing/i },
  { name: 'o-fight-early-killed', sections: OL, q: carry(FI, 'How many of their `li` did you kill in the earlier fight?'), expect: n(2) },
  { name: 'o-fight-early-lost-wk', sections: OL, q: carry(FI, 'How many of your workers did you lose in the earlier fight?'), expect: n(2) },
  { name: 'o-gone-which', sections: OL, q: carry(GO, 'Which building of theirs is gone? Answer with its token and id.'), expect: /br#?25/i },
  { name: 'o-gone-since', sections: OL, q: carry(GO, 'Since what cycle is that building gone?'), expect: n(1500) },
  { name: 'o-gone-li', sections: OL, q: carry(GO, 'How many `li` of theirs are seen now?'), expect: /(^|\D)0(\D|$)|none|zero/i },
  { name: 'o-econ-bank', sections: OL, q: carry(EO, 'How much ore is in your bank?'), expect: n(2) },
  { name: 'o-econ-committed', sections: OL, q: carry(EO, 'How much ore is committed to production under way?'), expect: n(2) },
  { name: 'o-econ-mined', sections: OL, q: carry(EO, 'How much ore did you mine in the window?'), expect: n(2) },
  { name: 'o-econ-spent-on', sections: OL, q: carry(EO, 'What did you spend ore on in the window? Answer with the token.'), expect: /wk/i },
  { name: 'o-econ-br-idle', sections: OL, q: carry(EO, 'For how many cycles of the window was your barracks idle?'), expect: n(100) },
  { name: 'o-push-army', sections: OL, q: carry(PB, 'How many army units do you have?'), expect: n(2) },
  { name: 'o-push-home', sections: OL, q: carry(PB, 'In the window, how many reflex packets sent your army at your base?'), expect: n(7) },
  { name: 'o-push-at-theirs', sections: OL, q: carry(PB, 'In the window, how many reflex packets sent your army at a building of theirs?'), expect: /(^|\D)0(\D|$)|none|zero/i },
];

// Push levers combed: one fact per question, no arithmetic.
const YC = ['Your call'];
export const levers = [
  { name: 'l-group-apart-3', sections: YC, q: '`group` is 2. Two of your army units are 3 steps apart. Are they in the same cluster? Answer yes or no.', expect: NO },
  { name: 'l-group-apart-2', sections: YC, q: '`group` is 2. Two of your army units are 2 steps apart. Are they in the same cluster? Answer yes or no.', expect: YES },
  { name: 'l-group-raise', sections: YC, q: 'You raise `group` from 2 to 3. Answer with one word, `farther` or `closer`: units in one cluster may now be ___ apart.', expect: /farther|further/i },
  { name: 'l-group-gather', sections: YC, q: '`pushLight` is 4. Your largest cluster holds 3 army units. Answer with one word, `push` or `gather`: what does the reflex do?', expect: /gather/i },
  { name: 'l-group-push', sections: YC, q: '`pushLight` is 3. Your largest cluster holds 3 army units. Answer with one word, `push` or `gather`: what does the reflex do?', expect: /^\W*push/i },
  { name: 'l-group-outside', sections: YC, q: 'During a push, what does an army unit outside the largest cluster do?', expect: /join|walk/i },
  { name: 'l-group-default', sections: YC, q: 'What is the default value for `group`?', expect: '2' },
  { name: 'l-guard-which', sections: YC, q: 'Under `guard`, which army units stay: those nearest your base or those nearest the target?', expect: /base/i },
  { name: 'l-guard-all', sections: YC, q: '`guard` is 2 and you have 2 army units. A push fires. How many of them push?', expect: /(^|\D)0(\D|$)|none|zero/i },
  { name: 'l-guard-wk', sections: YC, q: 'Does `guard` hold workers back? Answer yes or no.', expect: NO },
  { name: 'l-guard-trigger', sections: YC, q: 'Does raising `guard` change the count at which the push fires? Answer yes or no.', expect: NO },
  { name: 'l-engage-out', sections: YC, q: '`engage` is 2. You have 3 free army units. An enemy is 4 steps from your base, `defend` is 6, `panic` is 2. Answer with one word, `out` or `hold`: what do they do?', expect: /out/i },
  { name: 'l-engage-wk', sections: YC, q: 'Does `engage` count workers? Answer yes or no.', expect: NO },
  { name: 'l-post-where', sections: YC, q: '`post` is 3. How many steps from your base do idle free fighters hold?', expect: n(3) },
  { name: 'l-post-toward', sections: YC, q: 'Toward what does the post lie from your base?', expect: /target|their base|enemy base/i },
  { name: 'l-push-builds', sections: YC, q: 'Does raising `pushLight` build more units? Answer yes or no.', expect: NO },
  { name: 'l-push-recall', sections: YC, q: 'A push has launched. You raise `pushLight` above your army count. Does the push come back? Answer yes or no.', expect: NO },
  { name: 'l-defend-far', sections: YC, q: '`defend` is 6. One of your army units is pushing, 10 steps from your base. An enemy appears 4 steps from your base. Does `defend` pull that unit back? Answer yes or no.', expect: NO },
  { name: 'l-target-unset', sections: YC, q: '`target` is unset and their base stands. What does the push attack?', expect: /base/i },
  { name: 'l-target-next', sections: YC, q: '`target` is unset and their base is gone. What does the push attack next?', expect: /building|barracks|br/i },
  { name: 'l-rule-push', sections: YC, q: 'Which numbered rule of the reflex is the push?', expect: n(6) },
  // probe, no scorer
  { name: 'l-between-means', sections: ['Tokens', 'O lines', 'Your call'], q: 'In `O push`, which kinds of reflex order show as `between`?' },
  { name: 'l-between-gather', sections: ['Tokens', 'O lines', 'Your call'], q: 'The reflex orders your army to gather. Under which `O push` label is that packet counted? Answer with the label.', expect: /between/i },
];

// Economy facts: base hp in O home, O mine.
const HB = 'O home: my base hp4, was hp10 @t369; my army 2: 2 within d6 of my base; my wk 4 at base; their nearest mobile d12';
const M2 = 'O mine: harvesters 2: 1st rs#17 d3 o10; 2nd rs#16 d4 o17; next 3rd rs#18 d25 o11, d3 from their ba';
const M4 = 'O mine: harvesters 4: 1st rs#17 d3 o10; 2nd rs#16 d4 o17; 3rd rs#18 d25 o11, d3 from their ba; 4th rs#19 d26 o25, d4 from their ba';
const OY = ['Tokens', 'O lines', 'Your call'];
export const econ = [
  { name: 'e-hp-now', sections: OL, q: carry(HB, 'What is your base hp now?'), expect: n(4) },
  { name: 'e-hp-was', sections: OL, q: carry(HB, 'What was your base hp about 100 cycles earlier?'), expect: n(10) },
  { name: 'e-hp-fell', sections: OL, q: carry(HB, 'Did your base lose hp in the window? Answer yes or no.'), expect: YES },
  { name: 'e-hp-army', sections: OL, q: carry(HB, 'How many army units do you have?'), expect: n(2) },
  { name: 'e-mine-next', sections: OL, q: carry(M2, 'Which node would one more harvester take? Answer with its token and id.'), expect: /rs#?18/i },
  { name: 'e-mine-next-far', sections: OL, q: carry(M2, 'How many steps from your base is the node one more harvester would take?'), expect: n(25) },
  { name: 'e-mine-next-theirs', sections: OL, q: carry(M2, 'How many steps from their base is the node one more harvester would take?'), expect: n(3) },
  { name: 'e-mine-next-side', sections: OL, q: carry(M2, 'Is the node one more harvester would take nearer your base or their base? Answer `mine` or `theirs`.'), expect: /their/i },
  { name: 'e-mine-ore', sections: OL, q: carry(M2, 'How much ore is left in `rs#16`?'), expect: n(17) },
  { name: 'e-mine-count-near', sections: OL, q: carry(M4, 'How many of the listed nodes lie nearer their base than yours?'), expect: /(^|\D)2(\D|$)|two/i },
  { name: 'e-mine-fourth', sections: OL, q: carry(M4, 'Which node does the fourth harvester take? Answer with its token and id.'), expect: /rs#?19/i },
  { name: 'e-harv-order', sections: YC, q: 'Which node does the first harvester take: the nearest to your base or the farthest?', expect: /near/i },
  { name: 'e-harv-third', sections: OY, q: carry(M2, 'You set `harvesters` to 3. Which node does the third harvester take? Answer with its token and id.'), expect: /rs#?18/i },
];

// O threat.
const TH = 'O threat: their hv x1 d9 to my base; my base hp10';
export const threat = [
  { name: 'th-type', sections: OL, q: carry(TH, 'What unit type is nearest your base? Answer with the token.'), expect: /hv/i },
  { name: 'th-dist', sections: OL, q: carry(TH, 'How many steps is it from your base?'), expect: n(9) },
  { name: 'th-hp', sections: OL, q: carry(TH, 'What is your base hp?'), expect: n(10) },
  { name: 'th-whose', sections: OL, q: carry(TH, 'Whose unit is the `hv`: yours or theirs?'), expect: /their/i },
  { name: 'th-no-eta', sections: OL, q: carry(TH, 'Does this line say when their units will reach your base? Answer yes or no.'), expect: NO },
];

// O seen.
const SE = 'O seen: their li 7 seen: 4th t660, 5th t740, 6th t820, 7th t900; their hv 2 seen: 1st t1010, 2nd t1130';
export const seen = [
  { name: 'se-li-total', sections: OL, q: carry(SE, 'How many different Lights of theirs have you ever seen?'), expect: n(7) },
  { name: 'se-hv-total', sections: OL, q: carry(SE, 'How many different Heavies of theirs have you ever seen?'), expect: n(2) },
  { name: 'se-li-7th-cycle', sections: OL, q: carry(SE, 'At what cycle did their 7th Light first appear?'), expect: n(900) },
  { name: 'se-hv-1st-cycle', sections: OL, q: carry(SE, 'At what cycle did their first Heavy first appear?'), expect: n(1010) },
  { name: 'se-rg-total', sections: OL, q: carry(SE, 'How many different Ranged of theirs have you seen per this line?'), expect: a => /(^|\D)0(\D|$)|none/i.test(a) },
  { name: 'se-li-includes-dead', sections: OL, q: carry(SE, 'Does the count 7 include Lights that have since died? Answer yes or no.'), expect: YES },
  { name: 'se-no-forecast', sections: OL, q: carry(SE, 'Does this line say how many units they will build next? Answer yes or no.'), expect: NO },
];

// S (Plan) reading: one field per question, no arithmetic.
const PL = ['Plan'];
const SB = `S plan 3 set t699; kept 4 calls; replaced 2x, last why: lost li to hv
S1 done t754: hold post, guard 1 | army>=3 by t800: MET t754
S2 now since t754: mass li to 5 | army>=5 by t1050: pending (max 3, t814)
S3 next: push their base | foe_br==0 by t1500`;
const SM = `S plan 4 set t1064; kept 1 calls; replaced 3x, last why: hv waves
S1 now since t1064: mass li to 5 | army>=5 by t1200: MISSED (max 3); same claim since t754, by moved 2x
S2 next: push their base | foe_br==0 by t1700`;
export const plan = [
  { name: 'p-sb-inforce', sections: PL, q: carry(SB, 'Which step number is in force?'), expect: n(2) },
  { name: 'p-sb-step1-done', sections: PL, q: carry(SB, 'At what cycle was step 1 done?'), expect: n(754) },
  { name: 'p-sb-step2-deadline', sections: PL, q: carry(SB, 'What is the deadline cycle of step 2?'), expect: n(1050) },
  { name: 'p-sb-step2-best', sections: PL, q: carry(SB, 'What is the best army value measured during step 2?'), expect: n(3) },
  { name: 'p-sb-step2-passed', sections: PL, q: carry(SB, "Has step 2's deadline passed? Answer yes or no."), expect: NO },
  { name: 'p-sb-step3-begun', sections: PL, q: carry(SB, 'Has step 3 begun? Answer yes or no.'), expect: NO },
  { name: 'p-sb-plans-before', sections: PL, q: carry(SB, 'How many plans did you write before this one?'), expect: n(2) },
  { name: 'p-sb-kept-calls', sections: PL, q: carry(SB, 'How many of your calls kept this plan?'), expect: n(4) },
  { name: 'p-sb-why', sections: PL, q: carry(SB, 'What reason did you give for this plan?'), expect: /lost li to hv/i },
  { name: 'p-sb-set-cycle', sections: PL, q: carry(SB, 'At what cycle did you write this plan?'), expect: n(699) },
  { name: 'p-sb-step3-metric', sections: PL, q: carry(SB, 'What metric ends step 3?'), expect: /foe_br/i },
  { name: 'p-sm-step1-held', sections: PL, q: carry(SM, "Did step 1's condition hold before its deadline? Answer yes or no."), expect: NO },
  { name: 'p-sm-deadline-moved', sections: PL, q: carry(SM, "How many times has this claim's deadline been changed?"), expect: n(2) },
  { name: 'p-sm-inforce', sections: PL, q: carry(SM, 'Which step is in force?'), expect: n(1) },
  { name: 'p-sm-best-since', sections: PL, q: carry(SM, 'Since what cycle has the best value been counted?'), expect: n(754) },
  { name: 'p-tool-null-keeps', sections: YC, q: 'What value of `steps` keeps the plan in force?', expect: /null/i },
  { name: 'p-tool-max-steps', sections: YC, q: 'What is the most steps a plan can have?', expect: n(4) },
  { name: 'p-tool-why-null', sections: YC, q: 'What must `why` be when `steps` is null?', expect: /null/i },
  { name: 'p-tool-no-harness-change', sections: PL, q: 'Does the harness change your plan when a step is MISSED? Answer yes or no.', expect: NO },
  { name: 'p-tool-s-none', sections: PL, q: 'With `S none`, do you have a plan? Answer yes or no.', expect: NO },
];

// F lag clause: the read/landed cycles of the commander's last answer.
const FL = 'F set 5 in force 3 decisions: pushLight 3>5 | orders differed 1/3 | answer read t700, landed t994 | last: a 12,13 / was h 5';
export const lag = [
  { name: 'lag-read', sections: ['Feedback'], q: carry(FL, 'From the packet of which cycle was your last answer written?'), expect: n(700) },
  { name: 'lag-landed', sections: ['Feedback'], q: carry(FL, 'At what cycle did your last answer take effect?'), expect: n(994) },
  { name: 'lag-no-forecast', sections: ['Feedback'], q: carry(FL, 'Does this line say when your next answer will land? Answer yes or no.'), expect: NO },
];

// Seed: a plan the model did not write.
const SS = `S plan 1 set t0; kept 3 calls; given to you
S1 done t249: build a barracks | br>=1 by t300: MET t249
S2 now since t249: build an army of 3 | army>=3 by t650: pending (max 1, t334)
S3 next: destroy their barracks | foe_br==0 by t1500`;
const SG = `S plan 3 set t900; kept 1 calls; given to you, why: their hv beat li
S1 now since t900: mass hv to 3 | hv>=3 by t1300: pending (max 1, t950)`;
export const seed = [
  { name: 'seed-wrote', sections: PL, q: carry(SS, 'Did you write this plan? Answer yes or no.'), expect: NO },
  { name: 'seed-inforce', sections: PL, q: carry(SS, 'Which step is in force?'), expect: n(2) },
  { name: 'seed-kept', sections: PL, q: carry(SS, 'How many of your calls kept this plan?'), expect: n(3) },
  { name: 'seed-before', sections: PL, q: carry(SS, 'How many plans did you write before this one?'), expect: a => /(^|\D)0(\D|$)|none|zero/i.test(a) },
  { name: 'seed-mid-wrote', sections: PL, q: carry(SG, 'Did you write this plan? Answer yes or no.'), expect: NO },
  { name: 'seed-mid-why', sections: PL, q: carry(SG, 'What reason was given with this plan?'), expect: /their hv beat li/i },
];

const SD = `S plan 2 set t469; kept 5 calls; replaced 1x, last why: their hv beats li; all steps done t624
S1 done t624: defend vs hv with hv/rg, build army of 4 | army>=4 by t900: MET t624`;
export const done = [
  { name: 'd-inforce', sections: ['Plan'], q: carry(SD, 'Is any step of your plan in force? Answer yes or no.'), expect: NO },
  { name: 'd-when', sections: ['Plan'], q: carry(SD, 'At what cycle were all steps of your plan done?'), expect: n(624) },
  { name: 'd-steps', sections: ['Plan'], q: carry(SD, 'How many steps does this plan have?'), expect: n(1) },
];

// Lock: commander12, only the strategist writes the plan.
const SL = `S plan 2 set t640; given to you, why: their hv beat li
S1 done t700: train 2 hv | hv>=2 by t900: MET t700
S2 now since t700: army of 4 | army>=4 by t1100: pending (max 3, t760)`;
export const lock = [
  { name: 'lock-wrote', sections: PL, q: carry(SL, 'Did you write this plan? Answer yes or no.'), expect: NO },
  { name: 'lock-now', sections: PL, q: carry(SL, 'Which step is in force?'), expect: n(2) },
  { name: 'lock-change', sections: PL, q: carry(SL, 'Can you change this plan? Answer yes or no.'), expect: NO },
  { name: 'lock-why', sections: PL, q: carry(SL, 'What reason was given with this plan?'), expect: /their hv beat li/i },
];

// Strategist: strategist03, a seed given, then its own plan.
const SGV = `S plan 1 set t0; given to you, why: they are expected to train Heavy; Heavy beats Light
S1 done t249: build a barracks | br>=1 by t300: MET t249
S2 now since t249: train Heavy | hv>=2 by t900: pending (max 1, t400)`;
const SY = `S plan 2 set t640; yours, why: their rg outrange li
S1 now since t640: train 2 hv | hv>=2 by t900: pending (max 0, t640)`;
export const strat = [
  { name: 'strat-given-wrote', sections: PL, q: carry(SGV, 'Did you write this plan? Answer yes or no.'), expect: NO },
  { name: 'strat-yours-wrote', sections: PL, q: carry(SY, 'Did you write this plan? Answer yes or no.'), expect: YES },
  { name: 'strat-given-why', sections: PL, q: carry(SGV, 'What reason was given with this plan?'), expect: /expected to train Heavy/i },
  { name: 'strat-given-now', sections: PL, q: carry(SGV, 'Which step is in force?'), expect: n(2) },
];

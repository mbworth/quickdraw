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
  { name: 'memory-format', sections: ['Memory'], q: 'What two labeled fields does your N note format use, separated by `|`?', expect: a => hasAll(a, ['plan', 'doing']) },

  // Your call
  { name: 'call-defend-default', sections: ['Your call'], q: 'What is the default value for `defend`?', expect: '6' },
  { name: 'call-pushlight-heavy', sections: ['Your call'], q: 'Does `pushLight` count Heavy units toward its trigger?', expect: /yes/i },
  { name: 'call-train-lever', sections: ['Your call'], q: 'Which lever chooses what the barracks builds?', expect: /train/i },
  { name: 'call-pullback-lever', sections: ['Your call'], q: 'Once a push has launched, which lever can still pull units back?', expect: /defend/i },
  { name: 'call-required-fields', sections: ['Your call'], q: 'What are the two required fields on every tool call?', expect: a => hasAll(a, ['plan', 'expect']) },

  // Feedback
  { name: 'feedback-orders-differed', sections: ['Feedback'], q: 'What does `orders differed 0/5` mean?', expect: /same|identical|n.t.*shown|no.*effect|unchanged|not.*played/i },
  { name: 'feedback-example-verdict', sections: ['Feedback'], q: 'Given the line `F set 3 in force 5 decisions: defend 6>4 | orders differed 2/5 | plan: pull back and hold | expect hv>=3 by t1300: MET t1250 | last: a #5 3,3 ok / was m #5 3,3 ok`, was the expect MET, MISSED, or pending?', expect: /met/i },
  { name: 'feedback-f-none', sections: ['Feedback'], q: 'What does `F none` mean?', expect: /first|before|no (parameter|set|prior|previous|feedback)|not.*(yet|before)/i },
];

// Composite: two or more sections; reading only, no arithmetic (the harness computes counts, sums and grades).
const U = 'O units: my li x2 vs their li x3 | li 4hp 2dmg cost 2 80c: kills wk 1 swing, li 2, hv 4, rg 1 | hv 8hp 4dmg cost 3 120c: kills wk 1, li 1, hv 2, rg 1 | rg 1hp 1dmg range 3 cost 2 100c: kills wk 1, li 4, hv 8, rg 1';
const TR = 'O trig: pushLight 3: my army 2 (+1 in last 100c); barracksAt 3: my wk 5, br 1; defend 6/panic 2: their nearest mobile d3';
const HM = 'O home: my army 3: 3 within d6 of my base; my wk 5 at base; their nearest mobile d5';
const EC = 'O econ: my bank 1 (0 committed); mined +2/99c, spent 2/99c; ba#20 idle 99/99c, br#29 idle 80/99c; most idle ba#20';
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
  { name: 'c-f-grade', sections: ['Your call', 'Feedback'], q: 'The packet carries `F set 4 in force 6 decisions: train li>hv | orders differed 3/6 | plan: heavies vs their lights | expect hv>=2 by t900: MISSED (max 1) | last: t 29 hv / was t 29 li`. Did your last plan reach its expect?', expect: /^no\b|missed/i },
  { name: 'c-f-took-effect', sections: ['Your call', 'Feedback'], q: 'The packet carries `F set 4 in force 6 decisions: train li>hv | orders differed 3/6 | plan: heavies vs their lights | expect hv>=2 by t900: MISSED (max 1) | last: t 29 hv / was t 29 li`. Has your change to train shown up in the reflex orders yet?', expect: /^yes/i },
  { name: 'c-note-content', sections: ['Memory', 'Your call'], q: 'Which of these belongs in the N note: (a) "no threats near", (b) "hv 2 at 3,3, defend 6", (c) "they are winning"?', expect: /\bb\b/i },
];

// The one vocabulary table: every word in a packet comes from here (or is a number/punctuation).
// Feeds the tool description and the prompt's vocabulary section.
export const TYPE = { Worker: 'wk', Light: 'li', Heavy: 'hv', Ranged: 'rg', Base: 'ba', Barracks: 'br', Resource: 'rs' };
export const NAME = Object.fromEntries(Object.entries(TYPE).map(([k, v]) => [v, k]));
export const MOBILE = ['Worker', 'Light', 'Heavy', 'Ranged'];
export const STATE = { idle: 'i', move: 'm', harvest: 'h', return: 'r', produce: 'p', attack: 'a' };
export const TAG = { header: 'H', delta: 'D', triggers: 'T', production: 'P', economy: 'E', army: 'A', buildings: 'B', enemy: 'X', last: 'L' };
export const WORDS = ['t', 'r', 'u', 'd', 'hp', 'o', 'none', 'IDLE', 'ok', 'dropped', 'x', 'at', 'n', 'dmg', 'by', 'seen', 'lost', 'idle', 'done', 'started', 'over', 'win', 'loss', 'draw', 'kill', 'hb', 'resync', 'cap', 'bad', 'id', 'repeat', 'stale', 'dead', 'target', 'busy', 'poor', 'boxed', 'wall', 'gone', 'stuck', 'wait', 'ended', 'transport', 'cmd', 'train', 'move', 'attack', 'harvest', 'res', 'enemy', 'home'];
export const VOCAB = new Set([...Object.values(TYPE), ...Object.values(STATE), ...Object.values(TAG), ...WORDS]);

export const ABBR_TEXT = `Vocabulary: units ${Object.entries(TYPE).map(([k, v]) => `${v}=${k}`).join(' ')}; states ${Object.entries(STATE).map(([k, v]) => `${v}=${k}`).join(' ')}. Entities are type#id (wk#22). Positions are x,y with 0,0 top-left, y down. Layers: H header (t cycle, r resources, u mine/theirs), D delta since your last decision, T triggers, P production (building, what, ticks left), E resource nodes (o left, d steps from my base), A my mobile units as clusters (count@x,y state), B my buildings, X enemies (d = steps to my base/nearest unit), L your last orders with results.`;

export const ERR = [[/dead|gone/i, 'dead'], [/busy/i, 'busy'], [/resources|afford/i, 'poor'], [/boxed|no free/i, 'boxed'], [/wall|off.?map/i, 'wall'], [/wait/i, 'wait'], [/stuck/i, 'stuck'], [/ended|over/i, 'ended']];
export const errCode = msg => ((msg || '').startsWith('dropped:') ? msg : (ERR.find(([re]) => re.test(msg || ''))?.[1] ?? 'stuck'));

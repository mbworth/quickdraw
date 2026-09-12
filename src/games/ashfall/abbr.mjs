// The one vocabulary table: every word in a packet comes from here (or is a number/punctuation). Feeds the
// tool description and the prompt's vocabulary section.
export const UNIT = { worker: 'wk', trooper: 'tr', raider: 'rd', warden: 'wd', siege: 'sg' };
export const BUILDING = { core: 'co', barracks: 'ba', depot: 'dp', turret: 'tu', wall: 'wl', armory: 'ar', sensor: 'se' };
export const TYPE = { ...UNIT, ...BUILDING };
export const STATE = { idle: 'i', gather: 'g', return: 'g', move: 'm', attack: 'a', build: 'b' };
export const UPGRADE = { weapons: 'w', armor: 'a', optics: 'o', excavate: 'x', refine: 'r' };
export const FIELD_KIND = { 'my-base': 'home', expansion: 'exp', 'enemy-base': 'enemy', crystal: 'cry' };
export const IDLE_WHY = { 'build done, no ore within 40': 'noore', 'field exhausted': 'dry', 'no core to return to': 'nocore', 'no ore within 40': 'noore' };
export const TAG = { header: 'H', delta: 'D', triggers: 'T', production: 'P', economy: 'E', army: 'A', buildings: 'B', enemy: 'X', remembered: 'M', fields: 'F', last: 'L' };
export const WORDS = ['d', 'train', 'build', 'move', 'attack', 'stop', 'disband', 'gather', 'repair', 'cmd', 'reset', 'f', 't', 'o', 'c', 's', 'CAPPED', 'up', 'elim', 'none', 'q', 'IDLE', 'r', 'bld', 'hp', 'dmg', 'by', 'seen', 'lost', 'idle', 'done', 'placed', 'trained', 'cancel', 'research', 'ore', 'sup', 'bust', 'started', 'over', 'queued', 'kill', 'hb', 'resync', 'ok', 'dropped', 'x', 'at', 'age', 'n', 'cry', 'E', 'live', 'dry', 'cap', 'queue', 'full', 'bad', 'id', 'repeat', 'stale', 'dead', 'target', 'noore', 'nocry', 'capped', 'gone', 'nounits', 'rate', 'nospot', 'err', 'qfull', 'nobld', 'dug', 'am', 'pos', 'won', 'lost', 'me', 'them', 'ended', 'transport', 'no', 'result', 'chat', 'gg', 'enemy', 'home', 'exp'];

export const VOCAB = new Set([...Object.values(TYPE), ...Object.values(STATE), ...Object.values(UPGRADE), ...Object.values(FIELD_KIND), ...Object.values(IDLE_WHY), ...Object.values(TAG), ...WORDS]);

export const CMD_ERR = [[/not enough ore/i, 'noore'], [/not enough crystal/i, 'nocry'], [/queue full/i, 'qfull'], [/not found|not visible|no game/i, 'gone'], [/no units|no harvesters|units must be/i, 'nounits'], [/rate limited/i, 'rate'], [/no valid spot|can't build|placement/i, 'nospot'], [/supply|capped/i, 'capped'], [/not finished|needs|unknown|building/i, 'nobld'], [/disconnected|transport/i, 'transport'], [/game is over|not started/i, 'ended']];
export const errCode = msg => (msg || '').startsWith('dropped:') ? msg : (CMD_ERR.find(([re]) => re.test(msg || ''))?.[1] ?? 'err');

export const ABBR_TEXT = `Vocabulary (packet and orders): units ${Object.entries(UNIT).map(([k, v]) => `${v}=${k}`).join(' ')}; buildings ${Object.entries(BUILDING).map(([k, v]) => `${v}=${k}`).join(' ')}; states ${Object.entries(STATE).filter(([k]) => k !== 'return').map(([k, v]) => `${v}=${k}`).join(' ')}; upgrades ${Object.entries(UPGRADE).map(([k, v]) => `${v}=${k}`).join(' ')}. Entities are type#id (e.g. ba#12). Positions are x,z. Layers: H header (t clock, o ore, c crystal, s supply/cap), D delta since your last decision, T triggers, P production, E economy, A army clusters (count@x,z state), B buildings, X enemies visible (d = distance to my nearest building/army), M remembered enemy buildings, F fields (n = node ids), L your last orders with results.`;

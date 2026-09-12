// Frozen literal schema for `orders`: a discriminated union of the wire cmds plus act:boolean.
// Strict-compatible: every property required, optionals typed [x,"null"], additionalProperties false.
// Ids are strings only: an integer|string union here made the compiled strict grammar too large (400) on 2026-09-12.
const IDS = { type: 'array', items: { type: 'string' }, description: 'entity ids as strings ("12") and/or selectors: all army idle workers troopers raiders wardens siege' };
const INT = { type: 'integer' };
export const tool = Object.freeze({
  type: 'object',
  properties: {
    act: { type: 'boolean', description: 'false = nothing worth ordering now; cmds is then empty' },
    cmds: { type: 'array', items: { anyOf: [
      { $ref: '#/$defs/move' }, { $ref: '#/$defs/attack' }, { $ref: '#/$defs/stop' }, { $ref: '#/$defs/disband' }, { $ref: '#/$defs/gather' }, { $ref: '#/$defs/repair' },
      { $ref: '#/$defs/build' }, { $ref: '#/$defs/train' }, { $ref: '#/$defs/research' }, { $ref: '#/$defs/cancel' }, { $ref: '#/$defs/rally' },
    ] } },
    note: { type: ['string', 'null'], description: 'at most one short sentence, or null' },
  },
  required: ['act', 'cmds', 'note'],
  additionalProperties: false,
  $defs: {
    move: { type: 'object', properties: { cmd: { const: 'move' }, units: IDS, x: INT, z: INT, attackMove: { type: 'boolean' } }, required: ['cmd', 'units', 'x', 'z', 'attackMove'], additionalProperties: false },
    attack: { type: 'object', properties: { cmd: { const: 'attack' }, units: IDS, target: INT }, required: ['cmd', 'units', 'target'], additionalProperties: false },
    stop: { type: 'object', properties: { cmd: { const: 'stop' }, units: IDS }, required: ['cmd', 'units'], additionalProperties: false },
    disband: { type: 'object', properties: { cmd: { const: 'disband' }, units: IDS }, required: ['cmd', 'units'], additionalProperties: false },
    gather: { type: 'object', properties: { cmd: { const: 'gather' }, units: IDS, ore: { type: ['integer', 'null'], description: 'node id, or null for the nearest node within 45' } }, required: ['cmd', 'units', 'ore'], additionalProperties: false },
    repair: { type: 'object', properties: { cmd: { const: 'repair' }, units: IDS, target: INT }, required: ['cmd', 'units', 'target'], additionalProperties: false },
    build: { type: 'object', properties: { cmd: { const: 'build' }, workers: IDS, type: { type: 'string', enum: ['core', 'barracks', 'depot', 'turret', 'wall', 'armory', 'sensor'] }, x: INT, z: INT }, required: ['cmd', 'workers', 'type', 'x', 'z'], additionalProperties: false },
    train: { type: 'object', properties: { cmd: { const: 'train' }, building: INT, type: { type: 'string', enum: ['worker', 'trooper', 'raider', 'warden', 'siege'] }, count: { type: 'integer', description: '1-5; clamped to queue room' } }, required: ['cmd', 'building', 'type', 'count'], additionalProperties: false },
    research: { type: 'object', properties: { cmd: { const: 'research' }, building: INT, key: { type: 'string', enum: ['weapons', 'armor', 'optics', 'excavate', 'refine'] } }, required: ['cmd', 'building', 'key'], additionalProperties: false },
    cancel: { type: 'object', properties: { cmd: { const: 'cancel' }, building: INT }, required: ['cmd', 'building'], additionalProperties: false },
    rally: { type: 'object', properties: { cmd: { const: 'rally' }, building: INT, x: { type: ['integer', 'null'] }, z: { type: ['integer', 'null'] } }, required: ['cmd', 'building', 'x', 'z'], additionalProperties: false },
  },
});

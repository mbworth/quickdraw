// Frozen literal schema for the mock's single tool `move` (actionMode single: one element).
export const tool = Object.freeze({
  type: 'object',
  properties: {
    act: { type: 'boolean', description: 'false = nothing to do this turn' },
    cmds: { type: 'array', items: { anyOf: [{ $ref: '#/$defs/move' }, { $ref: '#/$defs/pass' }] } },
    note: { type: ['string', 'null'] },
  },
  required: ['act', 'cmds', 'note'],
  additionalProperties: false,
  $defs: {
    move: { type: 'object', properties: { cmd: { const: 'move' }, id: { type: 'integer' }, to: { type: 'integer' } }, required: ['cmd', 'id', 'to'], additionalProperties: false },
    pass: { type: 'object', properties: { cmd: { const: 'pass' } }, required: ['cmd'], additionalProperties: false },
  },
});

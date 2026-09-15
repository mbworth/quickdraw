// Frozen literal schema for `orders`. MicroRTS has one mode: the model writes one line of the order language
// (lang.mjs decodes it). JSON keys and quoted ids were ~60% of output tokens in Ashfall; there is no reason to
// pay that again for a game whose whole order set is four verbs.
export const tool = Object.freeze({
  type: 'object',
  properties: {
    o: { type: 'string', description: 'orders in the order language from the system prompt, ";"-separated; "-" when nothing is worth ordering. e.g. "t 20 wk 2; h wk#22; a all 13,13"' },
  },
  required: ['o'],
  additionalProperties: false,
});

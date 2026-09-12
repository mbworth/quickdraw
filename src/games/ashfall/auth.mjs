// One auth seam, two branches: keyed (live hub: Bearer header, hello carries the player) and
// open (local hub: no header, register once, player id travels in create/join).
export function makeAuth({ key = null, name = 'quickdraw' } = {}) {
  const keyed = !!key;
  let player = null;
  return {
    keyed,
    get player() { return player; },
    headers() { return keyed ? { Authorization: `Bearer ${key}` } : {}; },
    // Called with the hello frame and a request function; resolves the player id or null.
    async establish(hello, request) {
      if (hello?.player?.id) { player = hello.player.id; return player; }
      if (keyed) throw new Error('keyed hub sent hello without a player: bad key?');
      if (player) return player;
      const r = await request('register', { name });
      if (!r.ok) {
        const m = /pass your id/.test(r.error || '') ? null : r.error;
        throw new Error(`register failed: ${m || r.error}`);
      }
      player = r.result.id;
      return player;
    },
    // Fields to add to create/join on an open hub.
    seatFields() { return keyed ? {} : { player }; },
  };
}

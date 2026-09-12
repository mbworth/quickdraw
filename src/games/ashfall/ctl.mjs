// /ctl WebSocket client: correlation ids, one token bucket on every frame (handshake included), event buffer, reconnect.
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { createBucket } from '../../lib/bucket.mjs';

const BACKOFF = [500, 1000, 2000, 5000], MAX_ATTEMPTS = 10;   // ≈ 38 s of retries, then `close`
const RATE = 20, BURST = 50, HELLO_TIMEOUT_MS = 10000, REQUEST_TIMEOUT_MS = 10000, MAX_PAYLOAD = 1 << 20;
export const EVENT_CAP = { attacked: 12, sighted: 12, idle: 8, died: 12, default: 8 };

const urlOf = host => (/^wss?:\/\//.test(host) ? host.replace(/\/+$/, '') : `wss://${host}`) + '/ctl';
const isObj = x => x !== null && typeof x === 'object';

// Event key: the subject, so repeats collapse at insert.
export function eventKey(ev) {
  switch (ev.kind) {
    case 'attacked': return `${ev.id}`;
    case 'sighted': { const u = ev.units?.[0]; return u ? `${Math.floor(u.x / 20)},${Math.floor(u.z / 20)}` : '-'; }
    case 'died': case 'idle': case 'built': case 'placed': case 'trained': case 'cancelled': return `${ev.id}`;
    case 'research': return Object.keys(ev.upgrades || {}).join(',');
    case 'chat': return ev.from || '-';
    default: return '-';
  }
}

// WS is injectable so the reconnect and bad-frame paths run offline against a fake socket.
export function connect({ host, auth, clock, log = () => {}, WS = WebSocket }) {
  const em = new EventEmitter();
  const bucket = createBucket({ rate: RATE, burst: BURST, clock });
  const pending = new Map();
  const st = { ws: null, id: 0, seat: null, latest: null, closedByUs: false, connected: false, reconnecting: false, lastSeq: null, stats: { seqGaps: 0, reconnects: 0, rateLimited: 0, frames: 0, collapsed: 0, dropped: 0 } };
  let events = [], eventCount = new Map();

  function bufferEvent(ev) {
    if (st.lastSeq !== null && ev.seq > st.lastSeq + 1) st.stats.seqGaps += ev.seq - st.lastSeq - 1;   // seq is per game, both teams: gaps are the other side's events
    if (ev.seq !== undefined) st.lastSeq = ev.seq;
    const key = eventKey(ev);
    const i = events.findIndex(e => e.kind === ev.kind && e.key === key);
    if (i >= 0) { events[i] = { ...ev, key, count: events[i].count + 1, t0: events[i].t0 }; st.stats.collapsed++; return; }
    const cap = EVENT_CAP[ev.kind] ?? EVENT_CAP.default;
    const n = eventCount.get(ev.kind) || 0;
    if (n >= cap) { st.stats.dropped++; return; }
    eventCount.set(ev.kind, n + 1);
    events.push({ ...ev, key, count: 1, t0: clock.now() });
  }

  async function sendFrame(obj) {
    const ws = st.ws;   // the socket this frame was queued on: a reconnect while waiting for a token must not carry it
    await bucket.take();
    if (!st.connected || ws !== st.ws || ws.readyState !== WS.OPEN) throw new Error('disconnected');
    st.stats.frames++;
    ws.send(JSON.stringify(obj));
  }
  const settle = (id, r) => { const p = pending.get(id); if (!p) return; pending.delete(id); clock.clearTimeout(p.timer); p.resolve(r); };
  const failPending = why => { for (const id of [...pending.keys()]) settle(id, { ok: false, error: why }); };
  function request(type, fields = {}) {
    const id = ++st.id;
    return new Promise((resolve, reject) => {
      const timer = clock.setTimeout(() => settle(id, { ok: false, error: 'timeout' }), REQUEST_TIMEOUT_MS);   // a socket that stays open but stops answering must not hang a decision
      pending.set(id, { resolve, timer });
      sendFrame({ type, id, ...fields }).catch(e => { if (pending.delete(id)) { clock.clearTimeout(timer); reject(e); } });
    }).then(r => { if (!r.ok && /rate limited/.test(r.error || '')) st.stats.rateLimited++; return r; });
  }

  async function open() {
    await bucket.take();
    return new Promise((resolve, reject) => {
      const ws = new WS(urlOf(host), { headers: auth.headers(), maxPayload: MAX_PAYLOAD });
      st.ws = ws;
      let helloed = false;
      const t = clock.setTimeout(() => { if (!helloed) { ws.terminate(); reject(new Error('no hello')); } }, HELLO_TIMEOUT_MS);
      ws.on('open', () => { st.connected = true; });
      ws.on('message', buf => {
        let m; try { m = JSON.parse(buf.toString()); } catch { return; }
        if (!isObj(m)) return;
        switch (m.type) {   // every frame is untrusted: a malformed one is ignored, never thrown
          case 'hello': helloed = true; clock.clearTimeout(t); resolve(m); return;
          case 'result': settle(m.id, m); return;
          case 'state': if (isObj(m.state)) { st.latest = { state: m.state, t: clock.now() }; em.emit('state', m.state, st.latest.t); } return;
          case 'event': if (isObj(m.ev)) { bufferEvent(m.ev); em.emit('event', m.ev); } return;
        }
      });
      ws.on('error', e => { log('ws error', e.message); if (!helloed) { clock.clearTimeout(t); reject(e); } });
      ws.on('close', () => {
        clock.clearTimeout(t);
        const was = st.connected; st.connected = false;
        failPending('disconnected');
        if (!helloed || !was || st.closedByUs || st.reconnecting) return;
        em.emit('disconnect');
        reconnect();
      });
    });
  }

  // Detach the failed socket first: its close handler must not start a second reconnect loop.
  function drop() {
    const ws = st.ws; if (!ws) return;
    ws.removeAllListeners(); ws.on('error', () => {});
    try { ws.terminate(); } catch {}
    st.connected = false; failPending('disconnected');
  }
  async function reconnect() {
    st.reconnecting = true;
    const keep = setInterval(() => {}, 1 << 30);   // ref'd: a reconnect in progress must keep the process alive (core timers are unref'd)
    try {
      for (let i = 0; i < MAX_ATTEMPTS && !st.closedByUs; i++) {
        await new Promise(r => clock.setTimeout(r, BACKOFF[Math.min(i, BACKOFF.length - 1)]));
        if (st.closedByUs) return;
        try {
          const hello = await open();
          await auth.establish(hello, request);
          if (st.seat) {
            const r = await request('join', { game: st.seat.game, team: st.seat.team, ...auth.seatFields() });
            if (!r.ok) throw new Error(`rejoin: ${r.error}`);
          }
          st.stats.reconnects++;
          em.emit('reconnect');
          return;
        } catch (e) { log('reconnect attempt failed', e.message); drop(); }
      }
      if (!st.closedByUs) { log('reconnect gave up'); em.emit('close', new Error(`reconnect: ${MAX_ATTEMPTS} attempts failed`)); }
    } finally { clearInterval(keep); st.reconnecting = false; }
  }

  const client = {
    on: (ev, fn) => em.on(ev, fn),
    off: (ev, fn) => em.off(ev, fn),
    get latest() { return st.latest; },
    get stats() { return st.stats; },
    get seat() { return st.seat; },
    get player() { return auth.player; },
    get connected() { return st.connected; },
    request, hello: null,
    takeEvents() { const out = events; events = []; eventCount = new Map(); return out; },
    async connect() { client.hello = await open(); await auth.establish(client.hello, request); return client.hello; },
    games: () => request('games'),
    async create({ team = 0, size = 200, opponent = 'scripted', name } = {}) {
      const r = await request('create', { team, size, opponent, ...(name ? { name } : {}), ...auth.seatFields() });
      if (r.ok) st.seat = { game: r.result.game.id, team: r.result.team };
      return r;
    },
    async join({ game, team }) {
      const r = await request('join', { game, team, ...auth.seatFields() });
      if (r.ok) st.seat = { game: r.result.game.id, team: r.result.team };
      return r;
    },
    async leave() { const r = await request('leave'); st.seat = null; return r; },
    start: () => request('start'),
    concede: () => request('concede'),
    cmd: (cmd, args) => request('cmd', { cmd, args }),
    // Forced drop for tests: the server sees a dead socket; the reconnect path runs.
    terminate() { st.ws?.terminate(); },
    close() { st.closedByUs = true; st.ws?.close(); },
  };
  return client;
}

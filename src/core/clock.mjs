// Injectable clock. Real timers are unref'd so a forgotten timer never holds the process open.
export function realClock() {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; },
    clearTimeout: t => clearTimeout(t),
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); t.unref?.(); return t; },
    clearInterval: t => clearInterval(t),
  };
}

// Virtual clock for tests: time moves only through advance(); timers run in due order.
export function virtualClock(start = 0) {
  let t = start, seq = 0;
  const timers = new Map();
  const add = (fn, ms, repeat) => { const id = ++seq; timers.set(id, { id, due: t + Math.max(0, ms), fn, repeat: repeat ? Math.max(1, ms) : 0 }); return id; };
  const next = () => { let best = null; for (const x of timers.values()) if (!best || x.due < best.due || (x.due === best.due && x.id < best.id)) best = x; return best; };
  const tick = () => new Promise(r => setImmediate(r));
  return {
    now: () => t,
    setTimeout: (fn, ms) => add(fn, ms, false),
    clearTimeout: id => { timers.delete(id); },
    setInterval: (fn, ms) => add(fn, ms, true),
    clearInterval: id => { timers.delete(id); },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        await tick();
        const x = next();
        if (!x || x.due > end) break;
        t = Math.max(t, x.due);
        if (x.repeat) x.due = t + x.repeat; else timers.delete(x.id);
        x.fn();
      }
      await tick();
      t = end;
    },
    async flush() { await tick(); await tick(); },
  };
}

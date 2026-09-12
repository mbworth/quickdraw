// Run file writer: runs/<game>-<id>.jsonl. One ordered queue; important lines flush synchronously,
// states batch and flush on a timer or size so the hot loop is not blocked per state. Sync flush is the
// only thing that survives an uncaught exception, so the crash handlers flush the same queue.
import fs from 'node:fs';
import path from 'node:path';

const FLUSH_MS = 250, FLUSH_BYTES = 64 << 10;

export const readRun = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

function writeAll(fd, str) {
  const b = Buffer.from(str);
  for (let off = 0; off < b.length;) off += fs.writeSync(fd, b, off, b.length - off);   // a short write must not truncate a line
}

export function createRecorder(file, { clock, statePolicy = 'all', sampleEvery = 10 } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'a');
  let buf = [], bufBytes = 0, lines = 0, closed = false, timer = null;
  const stateLine = new Map();   // snapshot idx → line number

  function flush() {
    if (!buf.length || closed) return;
    const chunk = buf.join('');
    buf = []; bufBytes = 0;
    if (timer !== null) { clock.clearTimeout(timer); timer = null; }
    writeAll(fd, chunk);
  }
  function push(kind, obj, { immediate }) {
    if (closed) return -1;
    const line = JSON.stringify({ kind, t: clock.now(), ...obj }) + '\n';
    buf.push(line); bufBytes += line.length; lines++;
    if (immediate || bufBytes >= FLUSH_BYTES) flush();
    else if (timer === null) timer = clock.setTimeout(flush, FLUSH_MS);
    return lines;
  }
  const wantsState = snap => statePolicy === 'all' || (statePolicy === 'sampled' && snap.idx % sampleEvery === 0);

  const rec = {
    file,
    get lines() { return lines; },
    writeNow(kind, obj) { return push(kind, obj, { immediate: true }); },
    // Records a state under the policy; returns its line number or null.
    writeState(snap) {
      if (stateLine.has(snap.idx)) return stateLine.get(snap.idx);
      if (!wantsState(snap)) return null;
      return rec.ensureState(snap);
    },
    // Records a state regardless of policy (decision refs must resolve); returns its line number.
    ensureState(snap) {
      if (stateLine.has(snap.idx)) return stateLine.get(snap.idx);
      const n = push('state', { idx: snap.idx, st: snap.t, gt: snap.header?.clocks?.game, header: snap.header, native: snap.native }, { immediate: false });
      stateLine.set(snap.idx, n);
      return n;
    },
    flushAndClose() { if (closed) return; flush(); closed = true; try { fs.closeSync(fd); } catch {} },
  };
  return rec;
}

// Flush on every way out. With onSignal the recorder stays open: the caller stops the run and closes it.
// Returns a function that removes the handlers.
export function guardExit(recorder, { onSignal } = {}) {
  const sig = s => () => { recorder.writeNow('exit', { why: s }); if (onSignal) onSignal(s); else { recorder.flushAndClose(); process.exit(130); } };
  const err = kind => e => { try { recorder.writeNow('crash', { kind, error: String(e?.stack || e) }); recorder.flushAndClose(); } finally { console.error(e); process.exit(70); } };
  const h = { SIGINT: sig('SIGINT'), SIGTERM: sig('SIGTERM'), uncaughtException: err('uncaughtException'), unhandledRejection: err('unhandledRejection') };
  for (const [k, f] of Object.entries(h)) process.on(k, f);
  return () => { for (const [k, f] of Object.entries(h)) process.off(k, f); };
}

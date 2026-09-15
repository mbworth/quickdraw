// MicroRTS socket-AI transport. The engine dials OUT to us (launch_mode=CLIENT) and drives a strict lockstep
// over a newline-delimited JSON protocol (ai/socket/SocketAI.java, serialization_type=2):
//   budget <T> <I>            → "ack"
//   utt \n <UTT json>         → "ack"          (sent twice: once on reset, once at game start)
//   preGameAnalysis <ms> \n <state json> → "ack"
//   getAction <player> \n <state json>   → one PlayerAction json line
//   gameOver <winner> \n      → "ack"         (winner -1 = draw)
// The engine blocks on our reply with no timeout, so the reply delay IS the game clock: we pace the game by
// holding each getAction answer until `cycleMs` has passed since the previous one.
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

export function createProto({ port = 9898, host = '127.0.0.1', cycleMs = 100, clock, log = () => {}, onAction = () => [], spawnJava = true, dir = null, map = 'maps/16x16/basesWorkers16x16.xml', opponent = 'ai.abstraction.WorkerRush', maxCycles = 3000, extraProps = '', java = 'java' } = {}) {
  const em = new EventEmitter();
  let server = null, sock = null, child = null, tmp = null, lastReplyT = -Infinity, closed = false, bound = null;

  const write = line => { try { sock?.write(line + '\n'); } catch (e) { log('write failed', e.message); } };

  function onLine(rl) {
    let pending = null;
    rl.on('line', line => {
      if (pending === null) {
        const [cmd, ...rest] = line.trim().split(/\s+/);
        if (cmd === 'budget') { em.emit('budget', rest.map(Number)); write('ack'); }
        else if (cmd === 'utt' || cmd === 'preGameAnalysis' || cmd === 'getAction') pending = { cmd, rest };
        else if (cmd === 'gameOver') { write('ack'); em.emit('gameover', Number(rest[0])); }
        else if (line.trim()) log('unrecognized line:', line.slice(0, 80));
        return;
      }
      const { cmd, rest } = pending; pending = null;
      let payload = null;
      try { payload = JSON.parse(line); } catch (e) { log(`bad ${cmd} payload:`, e.message); write(cmd === 'getAction' ? '[]' : 'ack'); return; }
      if (cmd === 'utt') { em.emit('utt', payload); write('ack'); return; }
      if (cmd === 'preGameAnalysis') { em.emit('pregame', payload); write('ack'); return; }
      // getAction: the only place the game's clock moves.
      let actions = [];
      try { actions = onAction(payload, Number(rest[0])) || []; } catch (e) { log('onAction threw', e); }
      const reply = JSON.stringify(actions);
      const now = clock.now();
      const waitMs = Math.max(0, lastReplyT + cycleMs - now);
      lastReplyT = Math.max(now, lastReplyT + cycleMs);
      if (waitMs > 0) clock.setTimeout(() => write(reply), waitMs); else write(reply);
    });
  }

  return {
    get port() { return bound; },
    get connected() { return !!sock && !sock.destroyed; },
    on: (ev, fn) => em.on(ev, fn),
    // listen() resolves with the bound port (0 = ephemeral, for tests running in parallel).
    listen() {
      return new Promise((res, rej) => {
        server = net.createServer(s => {
          if (sock) { s.destroy(); return; }   // one engine per adapter
          sock = s;
          s.setNoDelay(true);
          s.write('welcome\n');
          onLine(readline.createInterface({ input: s }));
          s.on('close', () => { sock = null; if (!closed) em.emit('close'); });
          s.on('error', e => log('socket error', e.message));
          em.emit('connect');
        });
        server.on('error', rej);
        server.listen(port, host, () => { bound = server.address().port; res(bound); });
      });
    },
    // spawnEngine() writes a properties file and starts the java child from the built clone.
    spawnEngine() {
      if (!spawnJava) return null;
      if (!dir) throw new Error('microrts: MICRORTS_LOCAL or --microrts-local must point at the built clone');
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-microrts-'));
      const props = [
        'launch_mode=CLIENT', `server_address=${host}`, `server_port=${bound}`, 'serialization_type=2',
        'headless=true', `max_cycles=${maxCycles}`, `map_location=${map}`, `AI2=${opponent}`, extraProps,
      ].filter(Boolean).join('\n') + '\n';
      const file = path.join(tmp, 'microrts.properties');
      fs.writeFileSync(file, props);
      // lib/bots holds the tournament jars (ai.coac.CoacAI); the `lib/*` glob does not recurse into it.
      child = spawn(java, ['-cp', 'lib/*:lib/bots/*:bin', 'rts.MicroRTS', '-f', file], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', b => log('[java]', String(b).trim()));
      child.stderr.on('data', b => log('[java]', String(b).trim()));
      child.on('exit', code => { child = null; em.emit('engine-exit', code); });
      return child;
    },
    close() {
      closed = true;
      try { sock?.destroy(); } catch {}
      try { server?.close(); } catch {}
      try { child?.kill('SIGKILL'); } catch {}
      if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} tmp = null; }
    },
  };
}

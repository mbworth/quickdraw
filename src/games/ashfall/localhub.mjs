// Spawns the open local hub from the game repo (ASHFALL_LOCAL) for integration tests and fixture capture.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

export async function spawnLocalHub({ repo = process.env.ASHFALL_LOCAL, port = 8790, log = () => {} } = {}) {
  if (!repo) throw new Error('ASHFALL_LOCAL is not set');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-hub-'));
  const env = { ...process.env, ASHFALL_OPEN: '1', ASHFALL_PORT: String(port), ASHFALL_DB: path.join(dir, 'hub.db'), ASHFALL_IDS: path.join(dir, 'ids.json'), ASHFALL_SIZE: '200', ASHFALL_CREATE_BURST: '10', ASHFALL_CONN_BURST: '200' };
  delete env.ASHFALL_KEY; delete env.ASHFALL_HOST;
  const child = spawn(process.execPath, ['server/hub.mjs'], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => log(String(d).trim()));
  child.stderr.on('data', d => log(String(d).trim()));
  const host = `ws://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    const ok = await new Promise(r => { const ws = new WebSocket(host + '/ctl'); ws.on('open', () => { ws.close(); r(true); }); ws.on('error', () => r(false)); });
    if (ok) break;
    if (child.exitCode !== null) throw new Error(`hub exited ${child.exitCode}`);
    await new Promise(r => setTimeout(r, 250));
  }
  return { host, child, stop() { child.kill('SIGTERM'); fs.rmSync(dir, { recursive: true, force: true }); } };
}

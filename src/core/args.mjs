// CLI grammar: --k v, --k=v; booleans are an explicit list; --<game>-* collected into an opts bag.
export function parseArgs(argv, { booleans = [], game = null } = {}) {
  const flags = {}, gameOpts = {};
  const bool = new Set(booleans);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    let k = a.slice(2), v;
    const eq = k.indexOf('=');
    if (eq >= 0) { v = k.slice(eq + 1); k = k.slice(0, eq); }
    else if (bool.has(k)) v = true;
    else { v = argv[++i]; if (v === undefined) throw new Error(`--${k} needs a value`); }
    if (game && k.startsWith(game + '-')) gameOpts[camel(k.slice(game.length + 1))] = coerce(v);
    else flags[camel(k)] = coerce(v);
  }
  return { flags, gameOpts };
}
const camel = s => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const coerce = v => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v;

// Reads .env into process.env without overriding what is already set.
export async function loadEnv(path = '.env') {
  const fs = await import('node:fs');
  if (!fs.existsSync(path)) return false;
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return true;
}

export const loadAdapterModule = name => loadGameModule(name, 'index.mjs');

// loadGameModule(game, 'read.mjs' | 'policy/game38.mjs'): a game's own modules by convention, so a core tool can load
// one without naming a game. Nothing here knows what is inside.
export async function loadGameModule(name, file = 'index.mjs') {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad game name "${name}"`);
  if (!/^[a-z0-9-]+(\/[a-z0-9_-]+)?\.mjs$/i.test(file)) throw new Error(`bad module "${file}"`);
  const url = new URL(`../games/${name}/${file}`, import.meta.url);
  try { return await import(url.href); }
  catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && (err.url === url.href || err.url === url.pathname)) throw new Error(file === 'index.mjs' ? `no such game "${name}"` : `no such module "${name}/${file}"`);
    throw err;
  }
}

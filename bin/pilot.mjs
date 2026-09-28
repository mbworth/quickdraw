#!/usr/bin/env node
// Entry: node bin/pilot.mjs --game <name> [flags] [--<game>-* adapter opts]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, sha, redact, safeId, boot, modelFor, isScript, isCommander, commanderToolFor } from './_boot.mjs';
import { parseArgs, loadAdapterModule } from '../src/core/args.mjs';
import { realClock } from '../src/core/clock.mjs';
import { createRecorder, guardExit } from '../src/core/record.mjs';
import { nullModel, withMemory } from '../src/core/model.mjs';
import { runPilot } from '../src/core/pilot.mjs';

const BOOLEANS = ['help', 'print-config', 'event-tick', 'stream'];

export async function main(argv = process.argv.slice(2)) {
  const pre = await boot(argv, { booleans: BOOLEANS });
  const game = pre.flags.game;
  if (!game || pre.flags.help) { console.error('usage: pilot --game <name> [--model M|none] [--prompt file] [--heartbeat ms] [--deadline-margin ms] [--decision-deadline ms] [--packet-max n] [--full-every n] [--thinking adaptive|off] [--effort low|medium|high] [--reply tool|text] [--max-usd x] [--max-decisions n] [--concede-on never|budget] [--record-state all|on-decision|sampled] [--run-dir dir] [--stop-file path] [--stale-after ms] [--overlap n] [--reserve cls,cls] [--event-tick] [--stream] [--memory chars] [--journal n] [--log n] [--commander-model id] [--commander-every ms] [--commander-gate timer|events] [--commander-max-every ms] [--commander-steps true] [--script-params json] [--<game>-* ...]'); return 64; }
  const { flags, gameOpts } = parseArgs(argv, { booleans: BOOLEANS, game });
  const cfg = {
    game, model: flags.model ?? process.env.QUICKDRAW_MODEL ?? 'claude-sonnet-5', prompt: flags.prompt ?? null,
    heartbeat: flags.heartbeat ?? 3000, deadlineMargin: flags.deadlineMargin ?? 1000, decisionDeadline: flags.decisionDeadline ?? 6000,
    packetMax: flags.packetMax ?? 600, fullEvery: flags.fullEvery ?? 0, overlap: flags.overlap ?? 1, eventTick: !!flags.eventTick, thinking: String(flags.thinking ?? 'adaptive'), effort: flags.effort ?? 'low', reply: flags.reply ?? 'tool', stream: !!flags.stream, memory: flags.memory ?? 0, journal: flags.journal ?? 0, log: flags.log ?? 0, reserveFor: flags.reserve ? String(flags.reserve).split(',') : [],
    commanderModel: flags.commanderModel ?? 'claude-sonnet-5', commanderEveryMs: flags.commanderEvery ?? 5000, commanderGate: flags.commanderGate ?? 'timer', commanderMaxEveryMs: flags.commanderMaxEvery ?? (flags.commanderGate === 'events' ? 120000 : 0), commanderSteps: flags.commanderSteps === true, scriptParams: flags.scriptParams ? JSON.parse(String(flags.scriptParams)) : null,
    maxUsd: flags.maxUsd ?? Infinity, maxDecisions: flags.maxDecisions ?? Infinity, concedeOn: flags.concedeOn ?? 'never',
    recordState: flags.recordState ?? 'all', runDir: flags.runDir ?? path.join(ROOT, 'runs'), stopFile: flags.stopFile ?? null, staleAfter: flags.staleAfter ?? (flags.decisionDeadline ?? 6000) + 2000,   // must exceed the model's latency: the smoke of game 26 dropped every order at 2 s
    gameOpts: redact(gameOpts),
  };
  let mod;
  try { mod = await loadAdapterModule(game); }
  catch (e) { if (/^no such game|^bad game name/.test(e.message)) { console.error(e.message); return 64; } throw e; }
  const clock = realClock();
  const adapter = mod.createAdapter(process.env, { ...gameOpts, eventTick: cfg.eventTick, clock });
  const divisor = mod.divisor ?? 3.5;
  const system = cfg.prompt ? fs.readFileSync(cfg.prompt, 'utf8') : '';
  const tool = cfg.memory > 0 ? withMemory(adapter.tool, cfg.memory) : adapter.tool;   // --memory adds the `n` field; the run records the schema the API saw
  const resolved = { ...cfg, promptSha256: sha(system), schemaSha256: sha(JSON.stringify(tool)), divisor, meta: adapter.meta };
  // --model commander:*: the API sees the commander's parameter schema, not the game's order tool.
  if (isCommander(cfg.model)) resolved.commanderToolSha256 = sha(JSON.stringify(await commanderToolFor({ adapter, game, model: cfg.model, memory: cfg.memory, steps: cfg.commanderSteps })));
  else { delete resolved.commanderModel; delete resolved.commanderEveryMs; delete resolved.commanderGate; delete resolved.commanderMaxEveryMs; delete resolved.commanderSteps; }
  console.error(JSON.stringify(resolved, (_, v) => (v === Infinity ? 'inf' : v), 1));
  if (flags.printConfig) return 0;
  if (cfg.model !== 'none' && !isScript(cfg.model) && !cfg.prompt) { console.error('--prompt is required unless --model none or script:<name>'); return 64; }   // commander:*: the prompt is the commander's system prompt

  await adapter.connect();
  const { gameId, seat } = await adapter.seat(gameOpts);
  const rec = createRecorder(path.join(cfg.runDir, `${game}-${safeId(gameId)}.jsonl`), { clock, statePolicy: cfg.recordState });
  rec.writeNow('config', { ...resolved, gameId, seat, system, tool });   // the run replays without the repo: prompt text and schema inline
  // First signal stops the run cleanly (done line, leave, exit 130); a second one exits at once.
  const stopper = new AbortController();
  const unguard = guardExit(rec, { onSignal: () => { if (stopper.signal.aborted) { rec.flushAndClose(); process.exit(130); } stopper.abort(); } });

  const keepAlive = setInterval(() => {}, 1 << 30);   // core timers are unref'd; the run itself keeps the loop alive
  const callModel = cfg.model === 'none' ? nullModel() : await modelFor({ adapter, game, model: cfg.model, system, thinking: cfg.thinking, effort: cfg.effort, reply: cfg.reply, stream: cfg.stream, memory: cfg.memory, decisionDeadlineMs: cfg.decisionDeadline, clock, opts: { commanderModel: cfg.commanderModel, commanderEveryMs: cfg.commanderEveryMs, commanderGate: cfg.commanderGate, commanderMaxEveryMs: cfg.commanderMaxEveryMs, commanderSteps: cfg.commanderSteps, scriptParams: cfg.scriptParams, classifiers: gameOpts.classifiers } });
  const out = await runPilot({ adapter, callModel, clock, record: rec, log: (...a) => console.error(...a), stop: stopper.signal, opts: {
    heartbeatMs: cfg.heartbeat, deadlineMarginMs: cfg.deadlineMargin, packetMax: cfg.packetMax, divisor, fullEvery: cfg.fullEvery, staleAfterMs: cfg.staleAfter, maxInFlight: cfg.overlap, eventTick: cfg.eventTick, stream: cfg.stream, reserveFor: cfg.reserveFor, memoryMax: cfg.memory, journalN: cfg.journal, logN: cfg.log,
    maxUsd: cfg.maxUsd, maxDecisions: cfg.maxDecisions, concedeOn: cfg.concedeOn, stopFile: cfg.stopFile,
  } });
  clearInterval(keepAlive);
  unguard();
  rec.flushAndClose();
  console.error(`done: ${JSON.stringify(out.done)} decisions=${out.decisions} usd=${out.usd.toFixed(4)} run=${rec.file}`);
  return out.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().then(c => process.exit(c), e => { console.error(e); process.exit(70); });

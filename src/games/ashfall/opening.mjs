// A fixed opening for fixture capture: workers, a barracks, troopers with a rally, one crystal miner. Not strategy
// for the pilot; it exists so recorded states have production, an army, contact and a wave.
export function opening({ c, log = () => {} }) {
  let step = 0, busy = false, built = false;
  const say = async (cmd, args) => { const r = await c.cmd(cmd, args); log(`${cmd} ${JSON.stringify(args)} → ${r.ok ? r.result : r.error}`); return r; };
  return async function play(s) {
    if (busy) return; busy = true;
    try {
      const core = s.mine.find(e => e.type === 'core' && e.progress === undefined);
      const bar = s.mine.find(e => e.type === 'barracks');
      const workers = s.mine.filter(e => e.type === 'worker');
      if (step === 0 && core && s.ore >= 50) { await say('train', { building: core.id, type: 'worker' }); step = 1; }
      else if (step === 1 && s.time > 8 && s.ore >= 50) { await say('train', { building: core.id, type: 'worker' }); step = 2; }
      else if (step === 2 && s.ore >= 120 && !built && workers.length) { const w = workers[workers.length - 1]; await say('build', { workers: [w.id], type: 'barracks', x: s.myBase.x + (s.myBase.x < 0 ? 8 : -8), z: s.myBase.z + 6 }); built = true; step = 3; }
      else if (step === 3 && bar && bar.progress === undefined && s.ore >= 60 && (bar.queue || []).length < 2) { await say('train', { building: bar.id, type: 'trooper' }); if (!bar.rally) await say('rally', { building: bar.id, x: s.myBase.x + (s.myBase.x < 0 ? 12 : -12), z: s.myBase.z }); if (s.time > 100) step = 4; }
      else if (step === 4 && s.ore >= 75) { const w = workers[0]; if (w) await say('build', { workers: [w.id], type: 'depot', x: s.myBase.x, z: s.myBase.z - 8 }); step = 5; }
      else if (step === 5) { const cry = s.fields.find(f => f.res === 'crystal' && f.nodes.length); const w = workers[1]; if (cry && w) await say('gather', { units: [w.id], ore: cry.nodes[0].id }); step = 6; }
      else if (step >= 6 && bar && bar.progress === undefined && s.ore >= 60 && (bar.queue || []).length < 3) { await say('train', { building: bar.id, type: 'trooper' }); }
      const army = s.mine.filter(e => ['trooper', 'raider', 'warden', 'siege'].includes(e.type) && e.state === 'idle');
      if (s.time > 200 && army.length >= 6 && step < 7) { await say('move', { units: ['army'], x: 0, z: 0, attackMove: true }); step = 7; }
    } finally { busy = false; }
  };
}

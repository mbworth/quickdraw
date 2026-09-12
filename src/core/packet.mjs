// Assembles adapter layers under a token budget. Priority 0 never drops; lines go before their layer.
export const estTokens = (text, divisor) => Math.ceil(text.length / divisor);

const render = (layer, lines) => {
  const parts = [];
  if (layer.text) parts.push(layer.text);
  for (const l of lines) parts.push(l.text);
  return parts.join('\n');
};

// assemble(layers, {maxTokens, divisor, fullEvery, n}) → {text, kept, dropped, estTokens}; decision 1 is always full
export function assemble(layers, { maxTokens = 600, divisor = 3.5, fullEvery = 0, n = 0 } = {}) {
  const state = layers.map(l => ({ layer: l, lines: (l.lines || []).slice(), alive: true, droppedLines: 0 }));
  const dropped = [];
  if (fullEvery > 0 && (n - 1) % fullEvery !== 0) for (const s of state) if (s.layer.full && s.layer.priority > 0) { s.alive = false; dropped.push({ name: s.layer.name, reason: 'slim' }); }
  const text = () => state.filter(s => s.alive).map(s => render(s.layer, s.lines)).filter(Boolean).join('\n');
  const over = () => estTokens(text(), divisor) > maxTokens;
  while (over()) {
    const cands = state.filter(s => s.alive && s.layer.priority > 0);
    if (!cands.length) break;
    const victim = cands.reduce((a, b) => (b.layer.priority > a.layer.priority ? b : a));
    if (victim.lines.length) {
      const maxP = Math.max(...victim.lines.map(l => l.priority));
      const i = victim.lines.findLastIndex(l => l.priority === maxP);
      victim.lines.splice(i, 1); victim.droppedLines++;
      if (victim.lines.length) continue;
    }
    victim.alive = false;
    dropped.push({ name: victim.layer.name, reason: 'budget', lines: victim.droppedLines });
  }
  const out = text();
  return {
    text: out,
    kept: state.filter(s => s.alive).map(s => ({ name: s.layer.name, lines: s.lines.length, droppedLines: s.droppedLines })),
    dropped,
    estTokens: estTokens(out, divisor),
  };
}

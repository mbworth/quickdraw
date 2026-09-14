import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classStats, table } from '../../bin/classes.mjs';

const call = (n, cls, key, total, first) => ({ kind: 'call', n, stop: 'tool_use', anchor: 'event', triggers: [{ cls, key, t: 0 }], latency: { totalMs: total, firstSendMs: first } });
test('classStats attributes calls to the first trigger, counts no-ops, kept and accepted orders, and engine outcomes', () => {
  const rows = [
    { kind: 'trigger', outcomes: [{ cls: 'economy', key: 'oreworker', outcome: 'fired' }, { cls: 'danger', key: '1', outcome: 'coalesced' }] },
    call(1, 'economy', 'oreworker', 2000, 1800), { kind: 'decision', n: 1, orders: [{ cmd: 'train' }, { cmd: 'train' }], sent: [{ cmd: 'train' }], dropped: [{ reason: 'queue-full' }] }, { kind: 'result', n: 1, results: [{ ok: true }] },
    call(2, 'economy', 'oretrooper', 2100, null), { kind: 'decision', n: 2, orders: [], sent: [], dropped: [] }, { kind: 'result', n: 2, results: [] },
    call(3, 'danger', '1', 2500, 2400), { kind: 'decision', n: 3, orders: [{ cmd: 'move' }], sent: [{ cmd: 'move' }], dropped: [] }, { kind: 'result', n: 3, results: [{ ok: false, error: 'x' }] },
    { kind: 'call', n: 4, stop: 'timeout', skipped: 're-encode', triggers: [{ cls: 'danger', key: '2' }] },
  ];
  const s = classStats(rows);
  assert.equal(s.calls, 3);
  assert.deepEqual(s.classes.economy, { calls: 2, share: 67, noopPct: 50, sentPerCall: 0.5, keptPct: 50, okPct: 100, reactP50: 2000, firstP50: 1800, fired: 1, coalesced: 0, cooldown: 0, drops: { 'queue-full': 1 }, keys: { oreworker: 1, oretrooper: 1 } });
  assert.equal(s.classes.danger.okPct, 0); assert.equal(s.classes.danger.coalesced, 1); assert.equal(s.classes.danger.calls, 1);
  assert.match(table(s), /economy .* 67% .* 50%/);
});

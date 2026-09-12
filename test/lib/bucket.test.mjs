import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBucket } from '../../src/lib/bucket.mjs';
import { virtualClock } from '../../src/core/clock.mjs';

test('100 takes at 20/s burst 60 complete at the expected virtual instants, in order', async () => {
  const clock = virtualClock();
  const b = createBucket({ rate: 20, burst: 60, clock });
  const done = [];
  const ps = Array.from({ length: 100 }, (_, i) => b.take().then(() => done.push([i, clock.now()])));
  await clock.flush();
  assert.equal(done.length, 60, 'burst honoured');
  await clock.advance(2000);
  await Promise.all(ps);
  assert.equal(done.length, 100);
  assert.deepEqual(done.map(d => d[0]), Array.from({ length: 100 }, (_, i) => i), 'FIFO');
  assert.equal(done[60][1], 50);
  assert.equal(done[99][1], 2000);
});

test('tokens refill up to burst while idle', async () => {
  const clock = virtualClock();
  const b = createBucket({ rate: 10, burst: 5, clock });
  for (let i = 0; i < 5; i++) await b.take();
  assert.equal(Math.round(b.tokens), 0);
  await clock.advance(10000);
  assert.equal(b.tokens, 5);
});

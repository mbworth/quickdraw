// Token bucket, FIFO. take() resolves when a token is available; runs on the injected clock.
export function createBucket({ rate, burst, clock }) {
  let tokens = burst, last = clock.now(), timer = null;
  const queue = [];
  const refill = () => { const now = clock.now(); tokens = Math.min(burst, tokens + ((now - last) * rate) / 1000); last = now; };
  const drain = () => {
    timer = null;
    refill();
    while (queue.length && tokens >= 1) { tokens -= 1; queue.shift()(); }
    if (queue.length) timer = clock.setTimeout(drain, Math.max(1, Math.ceil(((1 - tokens) * 1000) / rate)));
  };
  return {
    take() { return new Promise(r => { queue.push(r); if (timer === null) drain(); }); },
    get tokens() { refill(); return tokens; },
    get waiting() { return queue.length; },
  };
}

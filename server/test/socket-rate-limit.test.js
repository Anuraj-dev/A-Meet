// Per-socket token-bucket rate limiting (socket/rate-limit.ts). Asserts external
// behavior only: under the limit the handler runs; over it the handler is
// dropped and (when there's an ack callback) a structured { error, retryAfterMs }
// is returned; tokens refill over time; sustained flooding disconnects the socket.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { consumeToken, createSocketRateLimiter } from '../src/socket/rate-limit.js';

function makeSocket(id = 'sock-1') {
  return { id, user: { id: 'user-1' }, disconnect: vi.fn() };
}

describe('consumeToken', () => {
  it('allows while tokens remain, then denies with a retry-after hint', () => {
    const config = { capacity: 2, refillPerSec: 1 };
    const state = { tokens: 2, last: 1000, violations: 0 };

    expect(consumeToken(state, config, 1000).allowed).toBe(true);
    expect(consumeToken(state, config, 1000).allowed).toBe(true);

    const denied = consumeToken(state, config, 1000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('refills by elapsed time so a later call is allowed again', () => {
    const config = { capacity: 2, refillPerSec: 1 };
    const state = { tokens: 0, last: 1000, violations: 0 };

    // 0 tokens now → denied.
    expect(consumeToken(state, config, 1000).allowed).toBe(false);
    // 1s later one token has refilled → allowed.
    expect(consumeToken(state, config, 2000).allowed).toBe(true);
  });

  it('never refills above capacity', () => {
    const config = { capacity: 3, refillPerSec: 100 };
    const state = { tokens: 3, last: 1000, violations: 0 };
    // A huge elapsed gap must not let tokens exceed capacity.
    consumeToken(state, config, 999999);
    expect(state.tokens).toBeLessThanOrEqual(3);
  });
});

describe('createSocketRateLimiter — guard', () => {
  let now;
  const opts = () => ({
    buckets: { chat: { capacity: 2, refillPerSec: 1 }, signaling: { capacity: 5, refillPerSec: 5 } },
    floodDisconnectThreshold: 4,
    now: () => now,
  });

  beforeEach(() => { now = 10_000; vi.clearAllMocks(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('runs the handler while under the bucket limit', () => {
    const limiter = createSocketRateLimiter(opts());
    const socket = makeSocket();
    const handler = vi.fn();
    const wrapped = limiter.guard(socket, 'chat', 'chat-message', handler);

    wrapped({ text: 'a' });
    wrapped({ text: 'b' });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('drops the handler and acks a structured error once the bucket is empty', () => {
    const limiter = createSocketRateLimiter(opts());
    const socket = makeSocket();
    const handler = vi.fn();
    const cb = vi.fn();
    const wrapped = limiter.guard(socket, 'chat', 'chat-message', handler);

    wrapped({ text: 'a' }, cb); // 1 (allowed — guard forwards cb to handler, not to caller)
    wrapped({ text: 'b' }, cb); // 2 (allowed)
    wrapped({ text: 'c' }, cb); // 3 (denied — guard answers cb itself)

    expect(handler).toHaveBeenCalledTimes(2);
    // The guard only invokes the ack itself on denial; allowed calls hand the cb
    // through to the (mock) handler, which ignores it.
    expect(cb).toHaveBeenCalledTimes(1);
    const ack = cb.mock.calls[0][0];
    expect(ack).toMatchObject({ error: expect.any(String), retryAfterMs: expect.any(Number) });
    expect(ack.retryAfterMs).toBeGreaterThan(0);
  });

  it('drops silently (no throw) when the over-limit event has no ack callback', () => {
    const limiter = createSocketRateLimiter(opts());
    const socket = makeSocket();
    const handler = vi.fn();
    const wrapped = limiter.guard(socket, 'chat', 'sfu-reaction', handler);

    wrapped({ emoji: '👍' });
    wrapped({ emoji: '👍' });
    expect(() => wrapped({ emoji: '👍' })).not.toThrow(); // denied, no cb — just dropped

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('lets the handler run again after tokens refill', () => {
    const limiter = createSocketRateLimiter(opts());
    const socket = makeSocket();
    const handler = vi.fn();
    const wrapped = limiter.guard(socket, 'chat', 'chat-message', handler);

    wrapped({}); wrapped({}); // drain capacity 2
    wrapped({});              // denied
    expect(handler).toHaveBeenCalledTimes(2);

    now += 1000;              // 1 token refills at 1/sec
    wrapped({});
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('disconnects the socket only after sustained flooding past the threshold', () => {
    const limiter = createSocketRateLimiter(opts());
    const socket = makeSocket();
    const handler = vi.fn();
    const wrapped = limiter.guard(socket, 'chat', 'chat-message', handler);

    // capacity 2 allowed, then keep hammering with no time passing.
    for (let i = 0; i < 10; i += 1) wrapped({});

    // threshold is 4 consecutive denials → disconnect fires.
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('keeps buckets independent per socket', () => {
    const limiter = createSocketRateLimiter(opts());
    const a = makeSocket('a');
    const b = makeSocket('b');
    const ha = vi.fn();
    const hb = vi.fn();
    const wa = limiter.guard(a, 'chat', 'chat-message', ha);
    const wb = limiter.guard(b, 'chat', 'chat-message', hb);

    wa({}); wa({}); wa({}); // a: 2 allowed, 1 denied
    wb({});                 // b: still has full capacity

    expect(ha).toHaveBeenCalledTimes(2);
    expect(hb).toHaveBeenCalledTimes(1);
  });
});

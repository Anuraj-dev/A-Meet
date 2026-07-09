// Per-actor token-bucket rate limiting (socket/rate-limit.ts). Asserts external
// behavior only: under the limit the handler runs; over it the handler is
// dropped and (when there's an ack callback) a structured { error, retryAfterMs }
// is returned; tokens refill over time; buckets are keyed to the ACTOR (user id,
// falling back to handshake IP) so parallel sockets and reconnects share one
// bucket; actor entries are evicted when the last socket disconnects; sustained
// flooding disconnects the socket.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { actorKeyFor, consumeToken, createSocketRateLimiter } from '../src/socket/rate-limit.js';

// Fake socket supporting multiple 'disconnect' listeners (like real socket.io).
function makeSocket({ id = 'sock-1', userId = 'user-1', headers = {}, address = '10.0.0.9' } = {}) {
  const listeners = {};
  return {
    id,
    user: userId ? { id: userId } : undefined,
    handshake: { headers, address },
    disconnect: vi.fn(),
    on: vi.fn((event, cb) => { (listeners[event] ||= []).push(cb); }),
    _fire(event) { (listeners[event] || []).forEach((cb) => cb()); },
  };
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

    expect(consumeToken(state, config, 1000).allowed).toBe(false);
    expect(consumeToken(state, config, 2000).allowed).toBe(true);
  });

  it('never refills above capacity', () => {
    const config = { capacity: 3, refillPerSec: 100 };
    const state = { tokens: 3, last: 1000, violations: 0 };
    consumeToken(state, config, 999999);
    expect(state.tokens).toBeLessThanOrEqual(3);
  });
});

describe('actorKeyFor', () => {
  it('keys on the authenticated user id when present', () => {
    expect(actorKeyFor(makeSocket({ userId: 'u-42' }))).toBe('user:u-42');
  });

  it('falls back to the RIGHTMOST X-Forwarded-For hop (the one nginx appended)', () => {
    const socket = makeSocket({ userId: null, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' } });
    expect(actorKeyFor(socket)).toBe('ip:203.0.113.7');
  });

  it('falls back to the handshake address without X-Forwarded-For', () => {
    expect(actorKeyFor(makeSocket({ userId: null, address: '198.51.100.2' }))).toBe('ip:198.51.100.2');
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

    wrapped({ emoji: 'x' });
    wrapped({ emoji: 'x' });
    expect(() => wrapped({ emoji: 'x' })).not.toThrow();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('lets the handler run again after tokens refill', () => {
    const limiter = createSocketRateLimiter(opts());
    const socket = makeSocket();
    const handler = vi.fn();
    const wrapped = limiter.guard(socket, 'chat', 'chat-message', handler);

    wrapped({}); wrapped({});
    wrapped({}); // denied
    expect(handler).toHaveBeenCalledTimes(2);

    now += 1000;
    wrapped({});
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('disconnects the socket only after sustained flooding past the threshold', () => {
    const limiter = createSocketRateLimiter(opts());
    const socket = makeSocket();
    const handler = vi.fn();
    const wrapped = limiter.guard(socket, 'chat', 'chat-message', handler);

    for (let i = 0; i < 10; i += 1) wrapped({});

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('keeps buckets independent per actor', () => {
    const limiter = createSocketRateLimiter(opts());
    const a = makeSocket({ id: 'a', userId: 'user-a' });
    const b = makeSocket({ id: 'b', userId: 'user-b' });
    const ha = vi.fn();
    const hb = vi.fn();
    const wa = limiter.guard(a, 'chat', 'chat-message', ha);
    const wb = limiter.guard(b, 'chat', 'chat-message', hb);

    wa({}); wa({}); wa({}); // user-a: 2 allowed, 1 denied
    wb({});                 // user-b: full bucket

    expect(ha).toHaveBeenCalledTimes(2);
    expect(hb).toHaveBeenCalledTimes(1);
  });
});

describe('createSocketRateLimiter — actor keying (bypass resistance)', () => {
  let now;
  const opts = () => ({
    buckets: { chat: { capacity: 2, refillPerSec: 1 } },
    floodDisconnectThreshold: 100,
    now: () => now,
  });

  beforeEach(() => { now = 10_000; vi.clearAllMocks(); });

  it('two parallel sockets with the same user id share ONE bucket', () => {
    const limiter = createSocketRateLimiter(opts());
    const s1 = makeSocket({ id: 's1', userId: 'user-x' });
    const s2 = makeSocket({ id: 's2', userId: 'user-x' });
    const h1 = vi.fn();
    const h2 = vi.fn();
    const w1 = limiter.guard(s1, 'chat', 'chat-message', h1);
    const w2 = limiter.guard(s2, 'chat', 'chat-message', h2);

    w1({}); w1({});   // drain the shared capacity of 2 via socket 1
    w2({});           // socket 2 must be denied — same actor, same bucket

    expect(h1).toHaveBeenCalledTimes(2);
    expect(h2).not.toHaveBeenCalled();
  });

  it('a SERIAL reconnect (disconnect fully, then a new socket) resumes the drained bucket', () => {
    const limiter = createSocketRateLimiter(opts());
    const s1 = makeSocket({ id: 's1', userId: 'user-x' });
    const h1 = vi.fn();
    const w1 = limiter.guard(s1, 'chat', 'chat-message', h1);

    w1({}); w1({});         // drain the bucket
    s1._fire('disconnect'); // actor has ZERO live sockets now

    now += 100; // reconnect shortly after — well inside the eviction grace
    const s2 = makeSocket({ id: 's2', userId: 'user-x' });
    const h2 = vi.fn();
    const w2 = limiter.guard(s2, 'chat', 'chat-message', h2);

    w2({}); // must be denied: dropping the socket must not mint a fresh bucket
    expect(h2).not.toHaveBeenCalled();
  });

  it('unauthenticated sockets sharing a client IP share one bucket', () => {
    const limiter = createSocketRateLimiter(opts());
    const s1 = makeSocket({ id: 's1', userId: null, headers: { 'x-forwarded-for': '203.0.113.7' } });
    const s2 = makeSocket({ id: 's2', userId: null, headers: { 'x-forwarded-for': '203.0.113.7' } });
    const h1 = vi.fn();
    const h2 = vi.fn();
    const w1 = limiter.guard(s1, 'chat', 'chat-message', h1);
    const w2 = limiter.guard(s2, 'chat', 'chat-message', h2);

    w1({}); w1({});
    w2({});

    expect(h2).not.toHaveBeenCalled();
  });

  it('evicts a fully-disconnected actor only after the grace period (no unbounded growth)', () => {
    const graceMs = 60_000;
    const limiter = createSocketRateLimiter({ ...opts(), evictionGraceMs: graceMs });
    const s1 = makeSocket({ id: 's1', userId: 'user-x' });
    const s2 = makeSocket({ id: 's2', userId: 'user-x' });
    limiter.guard(s1, 'chat', 'chat-message', vi.fn());
    limiter.guard(s2, 'chat', 'chat-message', vi.fn());

    expect(limiter.actorCount()).toBe(1);

    s1._fire('disconnect');
    s2._fire('disconnect'); // all sockets gone — entry lingers for the grace period

    now += graceMs / 2;
    limiter.guard(makeSocket({ id: 'other', userId: 'user-y' }), 'chat', 'chat-message', vi.fn());
    expect(limiter.actorCount()).toBe(2); // user-x still held (inside grace) + user-y

    now += graceMs; // past the grace for user-x
    limiter.guard(makeSocket({ id: 'other2', userId: 'user-z' }), 'chat', 'chat-message', vi.fn());
    expect(limiter.actorCount()).toBe(2); // user-x swept; user-y (still connected) + user-z
  });

  it('a reconnect during the grace period cancels the pending eviction', () => {
    const graceMs = 60_000;
    const limiter = createSocketRateLimiter({ ...opts(), evictionGraceMs: graceMs });
    const s1 = makeSocket({ id: 's1', userId: 'user-x' });
    limiter.guard(s1, 'chat', 'chat-message', vi.fn());
    s1._fire('disconnect');

    now += graceMs / 2;
    const s2 = makeSocket({ id: 's2', userId: 'user-x' }); // reconnects inside grace
    limiter.guard(s2, 'chat', 'chat-message', vi.fn());

    now += graceMs * 2; // long after the original disconnect
    limiter.guard(makeSocket({ id: 'p', userId: 'user-p' }), 'chat', 'chat-message', vi.fn());
    expect(limiter.actorCount()).toBe(2); // user-x survives — it has a live socket
  });
});

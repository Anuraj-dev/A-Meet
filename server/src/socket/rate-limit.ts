// Per-actor token-bucket rate limiting for Socket.io event handlers.
//
// Buckets are keyed by a stable ACTOR identity — the authenticated user id
// (sockets pass socketAuth, so it is normally present) with the handshake
// client IP as the fallback — NOT by the Socket instance. Keying per socket
// would let an attacker bypass every limit by reconnecting or opening parallel
// sockets: each new connection would mint a fresh bucket and reset the flood
// counter. All of one actor's sockets share the same buckets, and a reconnect
// resumes the drained bucket instead of resetting it.
//
// A bucket holds up to `capacity` tokens and refills at `refillPerSec`; every
// guarded event spends one token. When a bucket runs dry the event is DROPPED —
// the handler never runs — and, if the event carried an ack callback, that
// callback receives a structured `{ error, retryAfterMs }` (the same shape the
// HTTP 429 body uses) so the client can back off. We never disconnect on an
// ordinary over-limit blip; only sustained egregious flooding (many consecutive
// denials by one actor) trips a disconnect of the offending socket.
//
// Memory: actor entries are refcounted by their live sockets, but eviction is
// DELAYED by a grace period after the last socket disconnects — evicting
// immediately would hand a serial reconnect a fresh bucket, reopening the very
// bypass actor keying exists to close. Idle entries are swept lazily once the
// grace has passed (by then every bucket has fully refilled anyway, so evicting
// loses nothing). In-memory by design — single-node needs no shared store.

import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import type { Socket } from 'socket.io';

export interface BucketConfig {
  /** Maximum tokens the bucket can hold — the largest instantaneous burst. */
  capacity: number;
  /** Tokens replenished per second — the sustained allowed rate. */
  refillPerSec: number;
}

export interface BucketState {
  tokens: number;
  /** Epoch ms of the last refill/consume, used to compute elapsed refill. */
  last: number;
  /** Consecutive denials since the last allowed event (flood detection). */
  violations: number;
}

export interface ConsumeResult {
  allowed: boolean;
  /** When denied, ms until enough tokens refill to allow one event. */
  retryAfterMs: number;
}

/**
 * Refill by elapsed time, then try to spend one token. Mutates `state`.
 * Pure aside from the mutation + the injected `now`, so it unit-tests cleanly.
 */
export function consumeToken(state: BucketState, config: BucketConfig, now: number): ConsumeResult {
  const elapsedSec = Math.max(0, (now - state.last) / 1000);
  state.tokens = Math.min(config.capacity, state.tokens + elapsedSec * config.refillPerSec);
  state.last = now;

  if (state.tokens >= 1) {
    state.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  const deficit = 1 - state.tokens;
  const retryAfterMs = Math.ceil((deficit / config.refillPerSec) * 1000);
  return { allowed: false, retryAfterMs };
}

/**
 * Stable identity a bucket is keyed on: the authenticated user id when present
 * (socketAuth runs before any handler, so it normally is), else the handshake
 * client IP. For the IP we honor the same one-trusted-hop topology as the HTTP
 * `trust proxy: 1` setting: nginx appends the real client to X-Forwarded-For,
 * so the RIGHTMOST entry is trustworthy (left entries are client-forgeable).
 */
export function actorKeyFor(socket: Socket): string {
  const userId = socket.user?.id;
  if (userId) return `user:${userId}`;
  const xff = socket.handshake?.headers?.['x-forwarded-for'];
  const xffList = Array.isArray(xff) ? xff.join(',') : xff;
  const lastHop = xffList?.split(',').pop()?.trim();
  const ip = lastHop || socket.handshake?.address || 'unknown';
  return `ip:${ip}`;
}

interface ActorEntry {
  /** Live socket ids attached to this actor — the refcount for eviction. */
  sockets: Set<string>;
  buckets: Record<string, BucketState>;
  /** Epoch ms since the actor has had zero live sockets; null while connected. */
  emptySince: number | null;
}

// Per-socket "already tracked by the limiter" flag, so each socket registers
// its disconnect cleanup exactly once no matter how many handlers it guards.
const TRACKED = Symbol.for('a-meet.rateLimitTracked');

export interface SocketRateLimiterOptions {
  buckets: Record<string, BucketConfig>;
  floodDisconnectThreshold: number;
  /**
   * How long a disconnected actor's entry survives before eviction, so a
   * serial disconnect→reconnect resumes its drained bucket instead of minting
   * a fresh one. Defaults to 10 minutes.
   */
  evictionGraceMs?: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}

export interface SocketRateLimiter {
  /**
   * Wrap an event handler so each invocation spends a token from the actor's
   * `bucket`. Returns a drop-in replacement handler with the same signature.
   */
  guard<A extends unknown[]>(
    socket: Socket,
    bucket: string,
    event: string,
    handler: (...args: A) => void,
  ): (...args: A) => void;
  /** Exposed for tests: the actor's bucket state (created on demand). */
  getState(socket: Socket, bucket: string): BucketState;
  /** Exposed for tests: number of actors currently held in the store. */
  actorCount(): number;
}

export function createSocketRateLimiter(opts: SocketRateLimiterOptions): SocketRateLimiter {
  const now = opts.now ?? Date.now;
  const evictionGraceMs = opts.evictionGraceMs ?? 10 * 60 * 1000;
  const actors = new Map<string, ActorEntry>();

  // Lazy sweep, amortized over track() calls: evict actors whose last socket
  // disconnected longer than the grace period ago. By then their buckets have
  // long since refilled to capacity, so nothing meaningful is lost.
  function sweep(): void {
    const cutoff = now() - evictionGraceMs;
    for (const [key, entry] of actors) {
      if (entry.sockets.size === 0 && entry.emptySince !== null && entry.emptySince <= cutoff) {
        actors.delete(key);
      }
    }
  }

  // Attach this socket to its actor entry (creating it if needed) and register
  // a one-time disconnect cleanup. A reconnecting actor re-attaches to its
  // surviving entry — drained buckets and violation counts carry over.
  function track(socket: Socket): ActorEntry {
    sweep();
    const key = actorKeyFor(socket);
    let entry = actors.get(key);
    if (!entry) {
      entry = { sockets: new Set(), buckets: {}, emptySince: null };
      actors.set(key, entry);
    }

    const socketAny = socket as unknown as Record<symbol, boolean>;
    if (!socketAny[TRACKED]) {
      socketAny[TRACKED] = true;
      entry.sockets.add(socket.id);
      entry.emptySince = null;
      socket.on('disconnect', () => {
        const current = actors.get(key);
        if (!current) return;
        current.sockets.delete(socket.id);
        if (current.sockets.size === 0) current.emptySince = now();
      });
    }
    return entry;
  }

  function bucketState(entry: ActorEntry, bucket: string): BucketState {
    const config = opts.buckets[bucket];
    if (!config) throw new Error(`Unknown rate-limit bucket: ${bucket}`);
    return (entry.buckets[bucket] ??= { tokens: config.capacity, last: now(), violations: 0 });
  }

  function getState(socket: Socket, bucket: string): BucketState {
    return bucketState(track(socket), bucket);
  }

  function guard<A extends unknown[]>(
    socket: Socket,
    bucket: string,
    event: string,
    handler: (...args: A) => void,
  ): (...args: A) => void {
    const config = opts.buckets[bucket];
    if (!config) throw new Error(`Unknown rate-limit bucket: ${bucket}`);
    // Track at registration time (connection setup), so the disconnect cleanup
    // is in place even for a socket that never sends a guarded event.
    track(socket);

    return (...args: A): void => {
      const state = getState(socket, bucket);
      const { allowed, retryAfterMs } = consumeToken(state, config, now());

      if (allowed) {
        state.violations = 0;
        handler(...args);
        return;
      }

      state.violations += 1;
      logger.warn(
        {
          event: 'ratelimit.socket',
          socketEvent: event,
          bucket,
          actor: actorKeyFor(socket),
          socketId: socket.id,
          userId: socket.user?.id,
          retryAfterMs,
          violations: state.violations,
        },
        'socket rate limit hit',
      );

      // Sustained egregious flooding → cut the offending socket. The actor's
      // bucket and violation count survive the disconnect for the eviction
      // grace period, so reconnect-and-flood resumes the drained bucket and
      // keeps getting denied.
      if (state.violations >= opts.floodDisconnectThreshold) {
        socket.disconnect(true);
        return;
      }

      // Structured ack error when the event carried a callback; otherwise the
      // event is silently dropped (no ack channel to answer on).
      const maybeCallback = args[args.length - 1];
      if (typeof maybeCallback === 'function') {
        (maybeCallback as (ack: { error: string; retryAfterMs: number }) => void)({
          error: 'Rate limit exceeded — slow down and try again.',
          retryAfterMs,
        });
      }
    };
  }

  return { guard, getState, actorCount: () => actors.size };
}

/**
 * Process-wide limiter built from env defaults. Two buckets:
 *  - `signaling` — join + SFU handshake events (get-rtp-capabilities, transport
 *    create/connect, produce/consume/resume). High capacity: a large-room join
 *    fans out many consume calls in a burst.
 *  - `chat` — chat messages, reactions, raise-hand. Tighter, since these map to
 *    human-paced UI actions.
 */
export const socketRateLimiter: SocketRateLimiter = createSocketRateLimiter({
  buckets: {
    signaling: env.rateLimit.socket.signaling,
    chat: env.rateLimit.socket.chat,
  },
  floodDisconnectThreshold: env.rateLimit.socket.floodDisconnectThreshold,
});

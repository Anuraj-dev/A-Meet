// Per-socket token-bucket rate limiting for Socket.io event handlers.
//
// Each socket carries its own set of named buckets (e.g. `signaling`, `chat`).
// A bucket holds up to `capacity` tokens and refills at `refillPerSec`; every
// guarded event spends one token. When a bucket runs dry the event is DROPPED —
// the handler never runs — and, if the event carried an ack callback, that
// callback receives a structured `{ error, retryAfterMs }` (the same shape the
// HTTP 429 body uses) so the client can back off. We never disconnect on an
// ordinary over-limit blip; only sustained egregious flooding (many consecutive
// denials on one socket) trips a disconnect.
//
// In-memory and per-connection by design: the single-node deployment needs no
// shared store, and buckets die with the socket.

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

// Buckets live on the socket under a symbol key so they can't collide with
// Socket.io internals or app data, and are GC'd with the socket.
const BUCKETS = Symbol.for('a-meet.rateLimitBuckets');

export interface SocketRateLimiterOptions {
  buckets: Record<string, BucketConfig>;
  floodDisconnectThreshold: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}

export interface SocketRateLimiter {
  /**
   * Wrap an event handler so each invocation spends a token from `bucket`.
   * Returns a drop-in replacement handler with the same call signature.
   */
  guard<A extends unknown[]>(
    socket: Socket,
    bucket: string,
    event: string,
    handler: (...args: A) => void,
  ): (...args: A) => void;
  /** Exposed for tests: current bucket state for a socket (created on demand). */
  getState(socket: Socket, bucket: string): BucketState;
}

export function createSocketRateLimiter(opts: SocketRateLimiterOptions): SocketRateLimiter {
  const now = opts.now ?? Date.now;

  function getState(socket: Socket, bucket: string): BucketState {
    const config = opts.buckets[bucket];
    if (!config) throw new Error(`Unknown rate-limit bucket: ${bucket}`);
    const socketAny = socket as unknown as Record<symbol, Record<string, BucketState>>;
    const store = (socketAny[BUCKETS] ??= {});
    return (store[bucket] ??= { tokens: config.capacity, last: now(), violations: 0 });
  }

  function guard<A extends unknown[]>(
    socket: Socket,
    bucket: string,
    event: string,
    handler: (...args: A) => void,
  ): (...args: A) => void {
    const config = opts.buckets[bucket];
    if (!config) throw new Error(`Unknown rate-limit bucket: ${bucket}`);

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
          socketId: socket.id,
          userId: socket.user?.id,
          retryAfterMs,
          violations: state.violations,
        },
        'socket rate limit hit',
      );

      // Sustained egregious flooding → cut the socket. An occasional over-limit
      // event just gets dropped (below).
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

  return { guard, getState };
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

// Per-IP HTTP rate limiting on the auth and room route groups (app.ts). Uses
// createApp()'s test-only overrides to pin a tiny limit, then asserts external
// behavior: requests under the window pass through to the route (401 here, since
// no cookie), and the N+1th within the window gets 429 with a Retry-After header
// and a structured { error, retryAfterMs } body. A fresh app per test isolates
// the in-memory store.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('auth route rate limiting', () => {
  it('429s the request past the window limit, with Retry-After + structured body', async () => {
    const app = createApp({ auth: { max: 2, windowMs: 60_000 } });

    // Under the limit: the limiter passes through to the route. /api/auth/me has
    // no cookie so the route answers 401 — the point is it is NOT 429.
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);

    // 3rd request within the window trips the limiter.
    const limited = await request(app).get('/api/auth/me');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.body).toMatchObject({
      error: expect.any(String),
      retryAfterMs: expect.any(Number),
    });
  });

  it('does not rate-limit requests that stay under the limit', async () => {
    const app = createApp({ auth: { max: 5, windowMs: 60_000 } });
    for (let i = 0; i < 5; i += 1) {
      expect((await request(app).get('/api/auth/me')).status).not.toBe(429);
    }
  });
});

describe('room route rate limiting', () => {
  it('429s room requests past the window limit', async () => {
    const app = createApp({ room: { max: 2, windowMs: 60_000 } });

    expect((await request(app).get('/api/rooms/abc-defg-hij')).status).toBe(401);
    expect((await request(app).get('/api/rooms/abc-defg-hij')).status).toBe(401);

    const limited = await request(app).get('/api/rooms/abc-defg-hij');
    expect(limited.status).toBe(429);
    expect(limited.body.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps auth and room limiters independent', async () => {
    // Exhaust the room limiter; auth must remain unaffected (separate stores).
    const app = createApp({ room: { max: 1, windowMs: 60_000 }, auth: { max: 50, windowMs: 60_000 } });

    await request(app).get('/api/rooms/abc-defg-hij'); // 1 (ok-ish, 401)
    expect((await request(app).get('/api/rooms/abc-defg-hij')).status).toBe(429);
    // Auth still flows.
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});

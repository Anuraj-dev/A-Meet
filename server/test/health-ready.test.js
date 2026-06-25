import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

// Mock the worker pool so the route's readiness check is fully controllable and
// mediasoup (a native module) never loads in the test process.
vi.mock('../src/sfu/workers.js', () => ({
  areWorkersAlive: vi.fn(() => true),
}));

import { createApp } from '../src/app.js';
import { areWorkersAlive } from '../src/sfu/workers.js';

// mongoose.connection.readyState is a non-reconfigurable getter, so vi.spyOn
// can't be applied/restored repeatedly. Instead we shadow it once with a
// configurable own-property getter backed by a mutable variable, and remove the
// shadow afterwards so the real connection behaves normally again.
let mockReadyState = 1;
beforeAll(() => {
  Object.defineProperty(mongoose.connection, 'readyState', {
    configurable: true,
    get: () => mockReadyState,
  });
});
afterAll(() => {
  delete mongoose.connection.readyState;
});

describe('GET /api/health/ready (deep readiness)', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    mockReadyState = 1; // connected
    areWorkersAlive.mockReturnValue(true);
  });

  it('returns 200 { ok: true } when Mongo is connected and workers are alive', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 503 { ok: false, reason: "db" } when Mongo is not connected', async () => {
    mockReadyState = 0; // disconnected
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, reason: 'db' });
  });

  it('returns 503 { ok: false, reason: "workers" } when a worker is dead', async () => {
    areWorkersAlive.mockReturnValue(false);
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, reason: 'workers' });
  });

  it('reports db before workers when both are down', async () => {
    mockReadyState = 0;
    areWorkersAlive.mockReturnValue(false);
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('db');
  });
});

describe('GET /api/health (liveness stays shallow)', () => {
  it('returns 200 with { ok, env } regardless of dependency state', async () => {
    // Force every dependency to look down — liveness must still be 200.
    mockReadyState = 0;
    areWorkersAlive.mockReturnValue(false);
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.env).toBeDefined();
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

// createApp() wires up the real Express app (helmet, cors, routes, auth gating)
// but does NOT connect to Mongo or mediasoup — those live in server.js / io.js.
// So these checks exercise routing + middleware without any external services.
let app;
beforeAll(() => {
  app = createApp();
});

describe('GET /api/health', () => {
  it('returns ok:true', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('unknown routes', () => {
  it('404s with a Not found message', async () => {
    const res = await request(app).get('/this/does/not/exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('auth gating (no cookie → 401)', () => {
  it('blocks GET /api/auth/me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Not authenticated' });
  });

  it('blocks GET /api/rooms/:roomId before it ever reaches the DB', async () => {
    const res = await request(app).get('/api/rooms/abc-defg-hij');
    expect(res.status).toBe(401);
  });

  it('blocks POST /api/rooms', async () => {
    const res = await request(app).post('/api/rooms').send({});
    expect(res.status).toBe(401);
  });
});

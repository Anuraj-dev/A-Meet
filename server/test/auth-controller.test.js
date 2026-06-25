import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { signToken, COOKIE_NAME } from '../src/middleware/auth.js';
import { googleCallback } from '../src/controllers/auth.controller.js';

// Integration tests for auth.controller.js (googleCallback, getMe, logout).
//
// getMe/logout are driven through the real app (createApp + supertest).
// googleCallback runs *after* passport.authenticate in production, so we mount
// it behind a thin router that injects req.user the way Passport would — that
// exercises the handler's real cookie/redirect behavior without a Google call
// and without a DB.
let app;
beforeAll(() => {
  app = createApp();
});

const sampleUser = {
  id: '507f1f77bcf86cd799439011',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  avatar: 'https://img.example/ada.png',
};

function cookieFor(user) {
  return `${COOKIE_NAME}=${signToken(user)}`;
}

// Distinct client IP per request so the per-IP auth rate limiter (20/min) never
// trips across the suite. `trust proxy: 1` makes Express read X-Forwarded-For.
let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `10.30.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}

// Minimal app that injects req.user (as Passport does) then hands off to the
// real googleCallback. The `state` query is the OAuth state passthrough.
function callbackApp() {
  const a = express();
  a.get('/cb', (req, res) => {
    req.user = sampleUser;
    googleCallback(req, res);
  });
  return a;
}

function getSetCookie(res, name) {
  const all = res.headers['set-cookie'] || [];
  return all.find((c) => c.startsWith(`${name}=`));
}

describe('googleCallback', () => {
  it('sets an httpOnly JWT cookie and redirects to the client URL', async () => {
    const res = await request(callbackApp()).get('/cb');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(env.clientUrl);

    const cookie = getSetCookie(res, COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    // The cookie carries a non-empty token value.
    expect(cookie).toMatch(new RegExp(`^${COOKIE_NAME}=.+`));
  });

  it('honors a same-origin returnTo carried in the OAuth state', async () => {
    const res = await request(callbackApp()).get('/cb').query({ state: '/room/abc-defg-hij' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${env.clientUrl}/room/abc-defg-hij`);
  });

  it('ignores an open-redirect state and stays on the client origin', async () => {
    const res = await request(callbackApp()).get('/cb').query({ state: '//evil.com' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(env.clientUrl);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user with a valid cookie', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieFor(sampleUser))
      .set('X-Forwarded-For', freshIp());
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: sampleUser.id,
      email: sampleUser.email,
      name: sampleUser.name,
    });
  });

  it('401s without a cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('X-Forwarded-For', freshIp());
    expect(res.status).toBe(401);
  });

  it('401s with an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${COOKIE_NAME}=not-a-real-jwt`)
      .set('X-Forwarded-For', freshIp());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the auth cookie and returns ok', async () => {
    const res = await request(app).post('/api/auth/logout').set('X-Forwarded-For', freshIp());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const cookie = getSetCookie(res, COOKIE_NAME);
    expect(cookie).toBeDefined();
    // clearCookie sets an expiry in the past (Expires=1970 / Max-Age=0).
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });
});

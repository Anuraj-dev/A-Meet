import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth, signToken, cookieOptions, COOKIE_NAME } from '../src/middleware/auth.js';
import { env } from '../src/config/env.js';

// Minimal Express res double: records status + json payload.
function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const sampleUser = { id: 'user-123', name: 'Anuraj', email: 'a@x.io', avatar: 'http://img/a.png' };

describe('signToken + requireAuth round-trip', () => {
  it('signs a token requireAuth accepts, populating req.user', () => {
    const token = signToken(sampleUser);
    const req = { cookies: { [COOKIE_NAME]: token } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({
      id: 'user-123',
      name: 'Anuraj',
      email: 'a@x.io',
      avatar: 'http://img/a.png',
    });
  });

  it('the signed token carries the user claims and is verifiable', () => {
    const payload = jwt.verify(signToken(sampleUser), env.jwtSecret);
    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('a@x.io');
  });
});

describe('requireAuth rejections', () => {
  it('401s when no auth cookie is present', () => {
    const req = { cookies: {} };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Not authenticated' });
  });

  it('401s on a malformed / tampered token', () => {
    const req = { cookies: { [COOKIE_NAME]: 'not-a-real-jwt' } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });

  it('401s on a token signed with the wrong secret', () => {
    const forged = jwt.sign({ sub: 'x' }, 'some-other-secret');
    const req = { cookies: { [COOKIE_NAME]: forged } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
  });
});

describe('cookieOptions', () => {
  it('uses httpOnly + lax + non-secure in the test/dev environment', () => {
    const opts = cookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe('/');
    expect(opts.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    // env.isProd is false outside production → relaxed same-origin cookie.
    expect(opts.secure).toBe(false);
    expect(opts.sameSite).toBe('lax');
  });
});

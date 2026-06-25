import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { socketAuth } from '../src/middleware/socket-auth.js';
import { signToken, COOKIE_NAME } from '../src/middleware/auth.js';
import { env } from '../src/config/env.js';

// Unit tests for the Socket.io handshake auth middleware. No DB or network: we
// build a fake handshake and assert the next-spy rejection matrix, mirroring
// the style of auth.test.js for requireAuth.
const user = {
  id: '507f1f77bcf86cd799439011',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  avatar: '',
};

// Minimal Socket.io socket shape: socketAuth only reads handshake.headers.cookie.
function fakeSocket(cookieHeader) {
  return { handshake: { headers: cookieHeader ? { cookie: cookieHeader } : {} } };
}

describe('socketAuth', () => {
  it('accepts a valid cookie token and attaches the user', () => {
    const socket = fakeSocket(`${COOKIE_NAME}=${signToken(user)}`);
    const next = vi.fn();

    socketAuth(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // called with no error
    expect(socket.user).toMatchObject({ id: user.id, email: user.email, name: user.name });
  });

  it('rejects when no cookie header is present', () => {
    const socket = fakeSocket(undefined);
    const next = vi.fn();

    socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.user).toBeUndefined();
  });

  it('rejects when the auth cookie is absent from the header', () => {
    const socket = fakeSocket('other=value');
    const next = vi.fn();

    socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.user).toBeUndefined();
  });

  it('rejects a malformed token', () => {
    const socket = fakeSocket(`${COOKIE_NAME}=not-a-jwt`);
    const next = vi.fn();

    socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.user).toBeUndefined();
  });

  it('rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign({ sub: user.id }, 'a-different-secret');
    const socket = fakeSocket(`${COOKIE_NAME}=${forged}`);
    const next = vi.fn();

    socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.user).toBeUndefined();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: user.id }, env.jwtSecret, { expiresIn: -10 });
    const socket = fakeSocket(`${COOKIE_NAME}=${expired}`);
    const next = vi.fn();

    socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.user).toBeUndefined();
  });
});

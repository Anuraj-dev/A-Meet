import { describe, it, expect, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { mintLinkToken, verifyLinkToken } from '../src/integrations/discord/link-token.js';
import { signToken } from '../src/middleware/auth.js';

// Unit tests for the single-purpose Discord link token. The token binds one
// Discord ID, is short-lived, and is cryptographically distinct from the auth
// cookie JWT so neither can be used in the other's place.
describe('discord link token', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips the Discord ID it was minted for', () => {
    const token = mintLinkToken('123456789012345678');
    expect(verifyLinkToken(token)).toBe('123456789012345678');
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = mintLinkToken('123456789012345678');
    // Jump well past the ~10 minute lifetime.
    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
    expect(() => verifyLinkToken(token)).toThrow();
  });

  it('rejects a normal auth JWT presented as a link token', () => {
    const authToken = signToken({ id: 'u1', name: 'A', email: 'a@example.com', avatar: '' });
    expect(() => verifyLinkToken(authToken)).toThrow();
  });

  it('rejects a link token presented as an auth JWT (distinct signing key)', () => {
    const linkToken = mintLinkToken('123456789012345678');
    // requireAuth verifies against env.jwtSecret; the link token is signed with a
    // derived key, so it must fail that verification.
    expect(() => jwt.verify(linkToken, env.jwtSecret)).toThrow();
  });

  it('rejects a tampered token', () => {
    const token = mintLinkToken('123456789012345678');
    const tampered = `${token.slice(0, -3)}${token.slice(-3) === 'aaa' ? 'bbb' : 'aaa'}`;
    expect(() => verifyLinkToken(tampered)).toThrow();
  });
});

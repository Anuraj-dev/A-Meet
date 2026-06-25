import { describe, it, expect } from 'vitest';
import { googleVerify } from '../src/config/passport.js';
import { User } from '../src/models/User.js';
import { useMongoMemoryServer } from './helpers/mongo.js';

// DB-backed tests for the google-oauth20 verify callback, against the real User
// model on an in-memory MongoDB. The callback upserts on googleId, so a repeat
// sign-in must resolve the same User rather than duplicate it.
useMongoMemoryServer();

function fakeProfile(overrides = {}) {
  return {
    id: 'google-abc-123',
    displayName: 'Alan Turing',
    emails: [{ value: 'alan@example.com' }],
    photos: [{ value: 'https://img.example/alan.png' }],
    ...overrides,
  };
}

// Promisify the (err, user) done-callback so tests can await the result.
function verify(profile) {
  return new Promise((resolve, reject) => {
    googleVerify('access-token', 'refresh-token', profile, (err, user) => {
      if (err) reject(err);
      else resolve(user);
    });
  });
}

describe('googleVerify (google-oauth20 verify callback)', () => {
  it('creates exactly one User on first sign-in', async () => {
    const user = await verify(fakeProfile());

    expect(user.googleId).toBe('google-abc-123');
    expect(user.name).toBe('Alan Turing');
    expect(user.email).toBe('alan@example.com');
    expect(user.avatar).toBe('https://img.example/alan.png');
    expect(await User.countDocuments()).toBe(1);
  });

  it('reuses the existing User on repeat sign-in without duplicating', async () => {
    const first = await verify(fakeProfile());
    const second = await verify(fakeProfile({ displayName: 'Alan M. Turing' }));

    expect(String(second._id)).toBe(String(first._id));
    expect(second.name).toBe('Alan M. Turing'); // upsert refreshes profile fields
    expect(await User.countDocuments()).toBe(1);
  });
});

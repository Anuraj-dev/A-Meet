import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { signToken, COOKIE_NAME } from '../src/middleware/auth.js';
import { Room } from '../src/models/Room.js';
import { useMongoMemoryServer } from './helpers/mongo.js';

// Route-level integration tests for room.controller.js driven through
// room.routes.js with real Mongoose models against an in-memory MongoDB. The
// trust boundary under test is scheduled-meeting ownership/authorization.
useMongoMemoryServer();

let app;
beforeAll(() => {
  // createApp() wires the real routes, requireAuth, Joi validation and the
  // central error handler — but connects to no external services (Mongo is
  // provided by useMongoMemoryServer; mediasoup is never touched here).
  app = createApp();
});

// Forge the httpOnly auth cookie exactly as the OAuth callback does, so the
// requireAuth gate admits the request as this user.
function cookieFor(user) {
  return `${COOKIE_NAME}=${signToken(user)}`;
}

// A distinct authenticated user per call. `host`/`admin` on Room are ObjectId
// refs; the JWT `sub` is that id stringified (requireAuth sets req.user.id).
function makeUser() {
  const id = new mongoose.Types.ObjectId().toString();
  return { id, name: 'Test User', email: `u-${id}@example.com`, avatar: '' };
}

// A fresh client IP per request so the per-IP room rate limiter (30/min) never
// trips across the suite. `trust proxy: 1` makes Express read X-Forwarded-For.
let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `10.20.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}
function authed(method, path, user) {
  return request(app)[method](path)
    .set('Cookie', cookieFor(user))
    .set('X-Forwarded-For', freshIp());
}

// Seed a scheduled meeting owned by `owner` straight through the model. This
// keeps each test's HTTP traffic focused on the endpoint under test (and well
// under the rate limit) while still exercising the real schema.
function seedScheduledRoom(owner, overrides = {}) {
  return Room.create({
    roomId: 'abc-defg-hij',
    host: owner.id,
    admin: owner.id,
    participants: [],
    title: 'Standup',
    description: 'Daily sync',
    scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
    active: true,
    ...overrides,
  });
}

describe('POST /api/rooms (createRoom)', () => {
  it('creates an instant room owned by the caller', async () => {
    const user = makeUser();
    const res = await authed('post', '/api/rooms', user).send({});
    expect(res.status).toBe(201);
    expect(res.body.roomId).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    const doc = await Room.findOne({ roomId: res.body.roomId });
    expect(String(doc.host)).toBe(user.id);
  });
});

describe('POST /api/rooms/scheduled (createScheduledRoom)', () => {
  it('persists a scheduled room owned by the caller', async () => {
    const user = makeUser();
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await authed('post', '/api/rooms/scheduled', user).send({
      title: 'Planning',
      scheduledFor,
      description: 'Q3 roadmap',
    });
    expect(res.status).toBe(201);
    expect(res.body.roomId).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(res.body.title).toBe('Planning');

    const doc = await Room.findOne({ roomId: res.body.roomId });
    expect(String(doc.host)).toBe(user.id);
    expect(doc.scheduledFor).toBeInstanceOf(Date);
  });

  it('rejects an invalid body (no title/time) with 400', async () => {
    const user = makeUser();
    const res = await authed('post', '/api/rooms/scheduled', user).send({
      description: 'missing title and scheduledFor',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/rooms/mine (listMyMeetings)', () => {
  it("returns only the caller's scheduled meetings", async () => {
    const me = makeUser();
    const other = makeUser();
    await seedScheduledRoom(me, { roomId: 'aaa-bbbb-ccc', title: 'Mine' });
    await seedScheduledRoom(other, { roomId: 'ddd-eeee-fff', title: 'Theirs' });

    const res = await authed('get', '/api/rooms/mine', me);
    expect(res.status).toBe(200);
    expect(res.body.meetings.map((m) => m.title)).toEqual(['Mine']);
  });
});

describe('PATCH /api/rooms/scheduled/:roomId (updateScheduledRoom)', () => {
  it('lets the owner update the meeting', async () => {
    const owner = makeUser();
    await seedScheduledRoom(owner, { roomId: 'ghi-jklm-nop', title: 'Old title' });

    const res = await authed('patch', '/api/rooms/scheduled/ghi-jklm-nop', owner).send({
      title: 'New title',
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New title');

    const doc = await Room.findOne({ roomId: 'ghi-jklm-nop' });
    expect(doc.title).toBe('New title');
  });

  it('rejects a non-owner and leaves the document unchanged', async () => {
    const owner = makeUser();
    const intruder = makeUser();
    await seedScheduledRoom(owner, { roomId: 'qrs-tuvw-xyz', title: 'Locked title' });

    const res = await authed('patch', '/api/rooms/scheduled/qrs-tuvw-xyz', intruder).send({
      title: 'Hijacked',
    });
    expect(res.status).toBe(403);

    const doc = await Room.findOne({ roomId: 'qrs-tuvw-xyz' });
    expect(doc.title).toBe('Locked title');
  });
});

describe('DELETE /api/rooms/scheduled/:roomId (cancelScheduledRoom)', () => {
  it('lets the owner cancel (soft-delete via active:false)', async () => {
    const owner = makeUser();
    await seedScheduledRoom(owner, { roomId: 'cap-quiz-low' });

    const res = await authed('delete', '/api/rooms/scheduled/cap-quiz-low', owner);
    expect(res.status).toBe(204);

    const doc = await Room.findOne({ roomId: 'cap-quiz-low' });
    expect(doc.active).toBe(false);
  });

  it('rejects a non-owner and leaves the meeting active', async () => {
    const owner = makeUser();
    const intruder = makeUser();
    await seedScheduledRoom(owner, { roomId: 'dog-rope-fan' });

    const res = await authed('delete', '/api/rooms/scheduled/dog-rope-fan', intruder);
    expect(res.status).toBe(403);

    const doc = await Room.findOne({ roomId: 'dog-rope-fan' });
    expect(doc.active).toBe(true);
  });
});

describe('GET /api/rooms/:roomId (getRoom)', () => {
  it('returns an existing active room', async () => {
    const owner = makeUser();
    await seedScheduledRoom(owner, { roomId: 'lmn-opqr-stu' });

    const res = await authed('get', '/api/rooms/lmn-opqr-stu', owner);
    expect(res.status).toBe(200);
    expect(res.body.roomId).toBe('lmn-opqr-stu');
  });

  it('404s on an unknown room id', async () => {
    const user = makeUser();
    const res = await authed('get', '/api/rooms/non-exis-tnt', user);
    expect(res.status).toBe(404);
  });
});

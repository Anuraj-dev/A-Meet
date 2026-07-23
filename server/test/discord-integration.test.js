import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { signToken, COOKIE_NAME } from '../src/middleware/auth.js';
import { mintLinkToken } from '../src/integrations/discord/link-token.js';
import { DiscordLink } from '../src/models/DiscordLink.js';
import { Room } from '../src/models/Room.js';
import { env } from '../src/config/env.js';
import { useMongoMemoryServer } from './helpers/mongo.js';

// Route-level integration tests for the Discord integration endpoints, driven
// through the real app (routes + middleware + Joi validation + error handler)
// against an in-memory MongoDB. The trust boundaries under test are the
// bot-API-key gate, the user cookie gate, and the Discord↔user linking flow.
useMongoMemoryServer();

const BOT_KEY = 'test-discord-bot-key';
const DISCORD_ID = '123456789012345678';

let app;
beforeAll(() => {
  // The bot key is read from env at request time by the middleware, so setting
  // it here (before any request) is sufficient for the whole suite.
  env.discord.botApiKey = BOT_KEY;
  app = createApp();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeUser() {
  const id = new mongoose.Types.ObjectId().toString();
  return { id, name: 'Test User', email: `u-${id}@example.com`, avatar: '' };
}
function cookieFor(user) {
  return `${COOKIE_NAME}=${signToken(user)}`;
}
let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `10.30.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}
function botReq(method, path) {
  return request(app)[method](path).set('X-Bot-Api-Key', BOT_KEY).set('X-Forwarded-For', freshIp());
}

describe('POST /api/integrations/discord/link-token', () => {
  it('mints a token for a valid discordId with the bot key', async () => {
    const res = await botReq('post', '/api/integrations/discord/link-token').send({ discordId: DISCORD_ID });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    // The bot hands the user a ready-made confirmation URL.
    expect(res.body.linkUrl).toContain('/link/discord?token=');
  });

  it('rejects a request without the bot key (401)', async () => {
    const res = await request(app)
      .post('/api/integrations/discord/link-token')
      .set('X-Forwarded-For', freshIp())
      .send({ discordId: DISCORD_ID });
    expect(res.status).toBe(401);
  });

  it('rejects a request with a wrong bot key (401)', async () => {
    const res = await request(app)
      .post('/api/integrations/discord/link-token')
      .set('X-Bot-Api-Key', 'wrong-key')
      .set('X-Forwarded-For', freshIp())
      .send({ discordId: DISCORD_ID });
    expect(res.status).toBe(401);
  });

  it('rejects a missing/invalid discordId body (400)', async () => {
    const res = await botReq('post', '/api/integrations/discord/link-token').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/integrations/discord/link', () => {
  it('links the Discord ID to the signed-in user (upsert)', async () => {
    const user = makeUser();
    const token = mintLinkToken(DISCORD_ID);
    const res = await request(app)
      .post('/api/integrations/discord/link')
      .set('Cookie', cookieFor(user))
      .set('X-Forwarded-For', freshIp())
      .send({ token });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const link = await DiscordLink.findOne({ discordId: DISCORD_ID });
    expect(String(link.userId)).toBe(user.id);
  });

  it('requires a user cookie (401 without one)', async () => {
    const token = mintLinkToken(DISCORD_ID);
    const res = await request(app)
      .post('/api/integrations/discord/link')
      .set('X-Forwarded-For', freshIp())
      .send({ token });
    expect(res.status).toBe(401);
    expect(await DiscordLink.countDocuments()).toBe(0);
  });

  it('rejects an expired link token (400) and writes nothing', async () => {
    const user = makeUser();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = mintLinkToken(DISCORD_ID);
    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
    const res = await request(app)
      .post('/api/integrations/discord/link')
      .set('Cookie', cookieFor(user))
      .set('X-Forwarded-For', freshIp())
      .send({ token });
    expect(res.status).toBe(400);
    expect(await DiscordLink.countDocuments()).toBe(0);
  });

  it('rejects a normal auth JWT used as a link token (400)', async () => {
    const user = makeUser();
    const authToken = signToken(user); // wrong type — an auth cookie JWT
    const res = await request(app)
      .post('/api/integrations/discord/link')
      .set('Cookie', cookieFor(user))
      .set('X-Forwarded-For', freshIp())
      .send({ token: authToken });
    expect(res.status).toBe(400);
    expect(await DiscordLink.countDocuments()).toBe(0);
  });

  it('rejects a tampered link token (400)', async () => {
    const user = makeUser();
    const token = mintLinkToken(DISCORD_ID);
    const tampered = `${token.slice(0, -2)}xx`;
    const res = await request(app)
      .post('/api/integrations/discord/link')
      .set('Cookie', cookieFor(user))
      .set('X-Forwarded-For', freshIp())
      .send({ token: tampered });
    expect(res.status).toBe(400);
    expect(await DiscordLink.countDocuments()).toBe(0);
  });

  it('overwrites the mapping when a Discord ID is re-linked to a new user', async () => {
    const first = makeUser();
    const second = makeUser();

    await request(app)
      .post('/api/integrations/discord/link')
      .set('Cookie', cookieFor(first))
      .set('X-Forwarded-For', freshIp())
      .send({ token: mintLinkToken(DISCORD_ID) })
      .expect(200);

    await request(app)
      .post('/api/integrations/discord/link')
      .set('Cookie', cookieFor(second))
      .set('X-Forwarded-For', freshIp())
      .send({ token: mintLinkToken(DISCORD_ID) })
      .expect(200);

    // Exactly one mapping for the Discord ID, now pointing at the second user.
    expect(await DiscordLink.countDocuments({ discordId: DISCORD_ID })).toBe(1);
    const link = await DiscordLink.findOne({ discordId: DISCORD_ID });
    expect(String(link.userId)).toBe(second.id);
  });
});

describe('POST /api/integrations/discord/rooms', () => {
  async function link(user, discordId = DISCORD_ID) {
    await request(app)
      .post('/api/integrations/discord/link')
      .set('Cookie', cookieFor(user))
      .set('X-Forwarded-For', freshIp())
      .send({ token: mintLinkToken(discordId) })
      .expect(200);
  }

  it('creates a room hosted by the linked user', async () => {
    const user = makeUser();
    await link(user);

    const res = await botReq('post', '/api/integrations/discord/rooms').send({ discordId: DISCORD_ID });
    expect(res.status).toBe(201);
    expect(res.body.roomId).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);

    const room = await Room.findOne({ roomId: res.body.roomId });
    expect(String(room.host)).toBe(user.id);
    expect(String(room.admin)).toBe(user.id);
  });

  it('returns a distinct not-linked error (404 + code) for an unknown discordId', async () => {
    const res = await botReq('post', '/api/integrations/discord/rooms').send({ discordId: '999999999999999999' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_linked');
  });

  it('rejects a request without the bot key (401)', async () => {
    const res = await request(app)
      .post('/api/integrations/discord/rooms')
      .set('X-Forwarded-For', freshIp())
      .send({ discordId: DISCORD_ID });
    expect(res.status).toBe(401);
  });
});

describe('auth isolation between bot-key and user routes', () => {
  it('does NOT accept the bot key on a normal user route', async () => {
    // POST /api/rooms is cookie-auth; the bot key must not stand in for a user.
    const res = await request(app)
      .post('/api/rooms')
      .set('X-Bot-Api-Key', BOT_KEY)
      .set('X-Forwarded-For', freshIp())
      .send({});
    expect(res.status).toBe(401);
  });

  it('does NOT accept a user cookie on a bot-key route', async () => {
    const user = makeUser();
    const res = await request(app)
      .post('/api/integrations/discord/rooms')
      .set('Cookie', cookieFor(user))
      .set('X-Forwarded-For', freshIp())
      .send({ discordId: DISCORD_ID });
    expect(res.status).toBe(401);
  });
});

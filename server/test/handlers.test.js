// socket/handlers.js — connection wiring, presence/grace-window, chat relay,
// and host-gated transcript controls. Uses the capture-and-invoke pattern:
// a fake socket records each .on(event, cb), then tests invoke the captured
// callbacks with crafted payloads and assert external effects only (emits,
// acks, mocked manager calls). No real DB, no real mediasoup.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/socket/room-manager.js', () => ({
  addUser: vi.fn(),
  removeUser: vi.fn(),
  getRoomUsers: vi.fn(() => []),
  isUserInRoom: vi.fn(() => false),
  getUserRoom: vi.fn(() => null),
}));
vi.mock('../src/socket/webrtc.js', () => ({ registerWebrtcHandlers: vi.fn() }));
vi.mock('../src/socket/sfu-handlers.js', () => ({ registerSfuHandlers: vi.fn() }));
vi.mock('../src/models/Room.js', () => ({ Room: { findOne: vi.fn() } }));
vi.mock('../src/rooms/room-admin.js', () => ({ isRoomAdmin: vi.fn() }));
vi.mock('../src/socket/transcript-manager.js', () => ({
  cancelTranscriptExpiry: vi.fn(),
  scheduleTranscriptExpiry: vi.fn(),
  getTranscriptSnapshot: vi.fn(() => ({ active: false, segments: [] })),
  startTranscript: vi.fn(() => ({ active: true })),
  stopTranscript: vi.fn(() => ({ active: false })),
}));
vi.mock('../src/transcription/meeting-transcription.js', () => ({
  transcriptionConfigured: vi.fn(() => true),
  startContributor: vi.fn(),
  stopContributor: vi.fn(),
  stopRoomContributors: vi.fn(),
  sendContributorAudio: vi.fn(),
}));
vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { registerHandlers } from '../src/socket/handlers.js';
import { registerWebrtcHandlers } from '../src/socket/webrtc.js';
import { registerSfuHandlers } from '../src/socket/sfu-handlers.js';
// The REAL limiter — handlers.test.js deliberately does not mock it, so the
// chat guard these tests exercise is the production one, wired with production
// options and the production env bucket config.
import { chatMessageTokenCost, socketRateLimiter } from '../src/socket/rate-limit.js';
import { env } from '../src/config/env.js';
import {
  addUser, removeUser, getRoomUsers, isUserInRoom, getUserRoom,
} from '../src/socket/room-manager.js';
import { Room } from '../src/models/Room.js';
import { isRoomAdmin } from '../src/rooms/room-admin.js';
import {
  cancelTranscriptExpiry, scheduleTranscriptExpiry,
  getTranscriptSnapshot, startTranscript, stopTranscript,
} from '../src/socket/transcript-manager.js';
import {
  transcriptionConfigured, stopRoomContributors,
} from '../src/transcription/meeting-transcription.js';

const USER = { id: 'user-1', name: 'Alice' };
const ROOM = 'room-abc';

// Build a fake io/socket pair that captures handlers and collects emits.
function makeSocket(user = USER, socketId = 'sock-1') {
  const handlers = {};
  const socketEmits = [];
  const socket = {
    id: socketId,
    user,
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn((event, payload) => socketEmits.push({ event, payload })),
    to: vi.fn((target) => ({
      emit: (event, payload) => socketEmits.push({ target, event, payload }),
    })),
  };
  return { socket, handlers, socketEmits };
}

function makeIo() {
  const ioEmits = [];
  const connectionHandlers = [];
  const io = {
    on: vi.fn((event, cb) => { if (event === 'connection') connectionHandlers.push(cb); }),
    to: vi.fn((target) => ({ emit: (event, payload) => ioEmits.push({ target, event, payload }) })),
    in: vi.fn((target) => ({ emit: (event, payload) => ioEmits.push({ target, event, payload }) })),
    _connect: (socket) => connectionHandlers.forEach((cb) => cb(socket)),
  };
  return { io, ioEmits };
}

// Register handlers and connect a socket; returns everything needed to invoke handlers.
function setup(user = USER, socketId = 'sock-1') {
  const { io, ioEmits } = makeIo();
  const { socket, handlers, socketEmits } = makeSocket(user, socketId);
  registerHandlers(io);
  io._connect(socket);
  return { io, ioEmits, socket, handlers, socketEmits };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Default: user is not already in room, removeUser returns null, room is empty.
  isUserInRoom.mockReturnValue(false);
  removeUser.mockReturnValue(null);
  getRoomUsers.mockReturnValue([]);
  getUserRoom.mockReturnValue(null);
  transcriptionConfigured.mockReturnValue(true);
  getTranscriptSnapshot.mockReturnValue({ active: false, segments: [] });
  startTranscript.mockReturnValue({ active: true });
  stopTranscript.mockReturnValue({ active: false });
  Room.findOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ admin: USER.id }) }) });
  isRoomAdmin.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Connection wiring
// ---------------------------------------------------------------------------
describe('registerHandlers — connection wiring', () => {
  it('registers a connection listener on io', () => {
    const { io } = makeIo();
    registerHandlers(io);
    expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('calls registerWebrtcHandlers and registerSfuHandlers for each socket', () => {
    const { io } = setup();
    expect(registerWebrtcHandlers).toHaveBeenCalledWith(io, expect.objectContaining({ id: 'sock-1' }));
    expect(registerSfuHandlers).toHaveBeenCalledWith(io, expect.objectContaining({ id: 'sock-1' }));
  });
});

// ---------------------------------------------------------------------------
// join-room
// ---------------------------------------------------------------------------
describe('join-room', () => {
  it('ignores a non-string roomId', () => {
    const { handlers } = setup();
    handlers['join-room'](42);
    expect(addUser).not.toHaveBeenCalled();
  });

  it('ignores an empty-string roomId', () => {
    const { handlers } = setup();
    handlers['join-room']('');
    expect(addUser).not.toHaveBeenCalled();
  });

  it('joins the room, adds the user, emits room-users + transcript-snapshot to the joiner', () => {
    const { handlers, socket, socketEmits } = setup();
    getRoomUsers.mockReturnValue([USER]);
    getTranscriptSnapshot.mockReturnValue({ active: false, segments: [] });

    handlers['join-room'](ROOM);

    expect(socket.join).toHaveBeenCalledWith(ROOM);
    expect(addUser).toHaveBeenCalledWith(ROOM, socket.id, USER);
    expect(cancelTranscriptExpiry).toHaveBeenCalledWith(ROOM);
    expect(socketEmits.some((e) => e.event === 'room-users')).toBe(true);
    expect(socketEmits.some((e) => e.event === 'transcript-snapshot')).toBe(true);
  });

  it('emits user-joined to peers (tagged with the socketId) when the user was not already present', () => {
    const { handlers, socket, socketEmits } = setup();
    isUserInRoom.mockReturnValue(false);

    handlers['join-room'](ROOM);

    const joined = socketEmits.find((e) => e.event === 'user-joined');
    expect(joined).toBeTruthy();
    // The socketId rides along so peers can target this socket for moderation
    // even with the SFU media path off.
    expect(joined.payload).toMatchObject({ ...USER, socketId: socket.id });
  });

  it('does NOT emit user-joined when the user was already present (multi-tab)', () => {
    const { handlers, socketEmits } = setup();
    isUserInRoom.mockReturnValue(true);

    handlers['join-room'](ROOM);

    expect(socketEmits.some((e) => e.event === 'user-joined')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// leave-room
// ---------------------------------------------------------------------------
describe('leave-room', () => {
  it('is a no-op when removeUser returns nothing', () => {
    const { handlers, socketEmits } = setup();
    removeUser.mockReturnValue(null);

    handlers['leave-room']();

    expect(socketEmits.some((e) => e.event === 'user-left')).toBe(false);
  });

  it('removes the user and emits user-left when no other socket for that user remains', () => {
    const { handlers, socketEmits } = setup();
    removeUser.mockReturnValue({ roomId: ROOM, user: USER });
    isUserInRoom.mockReturnValue(false);

    handlers['leave-room']();

    expect(socketEmits.some((e) => e.event === 'user-left')).toBe(true);
  });

  it('does NOT emit user-left when another socket for that user is still present', () => {
    const { handlers, socketEmits } = setup();
    removeUser.mockReturnValue({ roomId: ROOM, user: USER });
    isUserInRoom.mockReturnValue(true);

    handlers['leave-room']();

    expect(socketEmits.some((e) => e.event === 'user-left')).toBe(false);
  });

  it('schedules transcript expiry when room becomes empty after leave', () => {
    const { handlers } = setup();
    removeUser.mockReturnValue({ roomId: ROOM, user: USER });
    isUserInRoom.mockReturnValue(false);
    getRoomUsers.mockReturnValue([]);

    handlers['leave-room']();

    expect(scheduleTranscriptExpiry).toHaveBeenCalledWith(ROOM);
  });
});

// ---------------------------------------------------------------------------
// disconnect grace window
// ---------------------------------------------------------------------------
describe('disconnect grace window', () => {
  it('defers user-left by LEAVE_GRACE_MS on unexpected disconnect', () => {
    const { handlers, ioEmits } = setup();
    removeUser.mockReturnValue({ roomId: ROOM, user: USER });
    isUserInRoom.mockReturnValue(false);

    handlers['disconnect']();

    // Not yet emitted immediately.
    expect(ioEmits.some((e) => e.event === 'user-left')).toBe(false);

    // After 4 s the leave fires.
    vi.advanceTimersByTime(4000);
    expect(ioEmits.some((e) => e.event === 'user-left')).toBe(true);
  });

  it('cancels the deferred leave when the user rejoins within the grace window', () => {
    const { handlers, ioEmits } = setup();
    removeUser.mockReturnValue({ roomId: ROOM, user: USER });
    isUserInRoom.mockReturnValue(false);

    handlers['disconnect']();

    // Rejoin before the 4s timer fires — join-room cancels the pending leave.
    handlers['join-room'](ROOM);

    vi.advanceTimersByTime(4000);

    // user-left must NOT have fired.
    expect(ioEmits.some((e) => e.event === 'user-left')).toBe(false);
  });

  it('suppresses user-joined when rejoining within the grace window', () => {
    const { handlers, socketEmits } = setup();
    removeUser.mockReturnValue({ roomId: ROOM, user: USER });
    isUserInRoom.mockReturnValue(false);

    handlers['disconnect']();
    // Clear any prior socketEmits from setup
    socketEmits.length = 0;

    // Rejoin in grace window
    handlers['join-room'](ROOM);

    // user-joined should be suppressed since rejoinedInGrace is true
    expect(socketEmits.some((e) => e.event === 'user-joined')).toBe(false);
  });

  it('pushes peers an updated roster when a peer rejoins within the grace window', () => {
    const { handlers, socketEmits } = setup();
    removeUser.mockReturnValue({ roomId: ROOM, user: USER });
    isUserInRoom.mockReturnValue(false);
    getRoomUsers.mockReturnValue([{ ...USER, socketId: 'sock-1' }]);

    handlers['disconnect']();
    socketEmits.length = 0; // ignore emits from the original join

    handlers['join-room'](ROOM);

    // Peers (socket.to(roomId)) get a fresh room-users so their moderation
    // targets follow the reconnected peer's new socket id — even though the
    // user-joined toast/chime stays suppressed for a grace reconnect.
    const toPeers = socketEmits.find((e) => e.event === 'room-users' && e.target === ROOM);
    expect(toPeers).toBeTruthy();
    expect(toPeers.payload).toEqual([{ ...USER, socketId: 'sock-1' }]);
    expect(socketEmits.some((e) => e.event === 'user-joined')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// chat-message
// ---------------------------------------------------------------------------
describe('chat-message', () => {
  it('rejects malformed event arguments without throwing and uses a trailing acknowledgement', () => {
    getUserRoom.mockReturnValue(ROOM);

    const noPayload = setup({ ...USER, id: 'user-no-payload' });
    expect(() => noPayload.handlers['chat-message']()).not.toThrow();

    const nullPayload = setup({ ...USER, id: 'user-null-payload' });
    const nullCallback = vi.fn();
    expect(() => nullPayload.handlers['chat-message'](null, nullCallback)).not.toThrow();
    expect(nullCallback).toHaveBeenCalledWith({
      ok: false,
      code: 'EMPTY_MESSAGE',
      message: expect.any(String),
    });

    const extraArgument = setup({ ...USER, id: 'user-extra-argument' });
    const callback = vi.fn();
    expect(() => extraArgument.handlers['chat-message']({ text: 'x' }, 'extra', callback)).not.toThrow();
    expect(callback).toHaveBeenCalledWith({ ok: true, messageId: expect.any(String) });
  });

  it('delivers an exactly 16,000-character message intact with server-minted metadata', () => {
    const { handlers, ioEmits } = setup();
    const callback = vi.fn();
    const text = 'x'.repeat(16_000);
    getUserRoom.mockReturnValue(ROOM);

    handlers['chat-message']({ text }, callback);

    const msg = ioEmits.find((e) => e.event === 'chat-message');
    expect(msg).toBeDefined();
    expect(msg.target).toBe(ROOM);
    expect(msg.payload.sender).toEqual(USER);
    expect(msg.payload.text).toBe(text);
    expect(msg.payload.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(msg.payload.kind).toBe('text');
    expect(typeof msg.payload.sentAt).toBe('number');
    expect(callback).toHaveBeenCalledWith({ ok: true, messageId: msg.payload.id });
  });

  it('rejects empty text without broadcasting it', () => {
    const { handlers, ioEmits } = setup();
    const callback = vi.fn();
    getUserRoom.mockReturnValue(ROOM);
    handlers['chat-message']({ text: '' }, callback);

    expect(callback).toHaveBeenCalledWith({ ok: false, code: 'EMPTY_MESSAGE', message: expect.any(String) });
    expect(ioEmits.some((e) => e.event === 'chat-message')).toBe(false);
  });

  it('rejects a sender that is not in a room', () => {
    const { handlers, ioEmits } = setup();
    const callback = vi.fn();
    getUserRoom.mockReturnValue(null);
    handlers['chat-message']({ text: 'Hi' }, callback);

    expect(callback).toHaveBeenCalledWith({ ok: false, code: 'NOT_IN_ROOM', message: expect.any(String) });
    expect(ioEmits.some((e) => e.event === 'chat-message')).toBe(false);
  });

  it('rejects a 16,001-character message without broadcasting it', () => {
    const { handlers, ioEmits } = setup({ ...USER, id: 'user-oversized-message' });
    const callback = vi.fn();
    getUserRoom.mockReturnValue(ROOM);

    handlers['chat-message']({ text: 'x'.repeat(16_001) }, callback);

    expect(callback).toHaveBeenCalledWith({
      ok: false,
      code: 'MESSAGE_TOO_LONG',
      message: expect.any(String),
      maxLength: 16_000,
    });
    expect(ioEmits.some((event) => event.event === 'chat-message')).toBe(false);
  });

  it('rejects a payload whose serialized size exceeds the chat byte backstop', () => {
    const { handlers, ioEmits } = setup({ ...USER, id: 'user-padded-payload' });
    const callback = vi.fn();
    getUserRoom.mockReturnValue(ROOM);

    handlers['chat-message']({ text: 'ok', padding: 'x'.repeat(64 * 1024) }, callback);

    expect(callback).toHaveBeenCalledWith({
      ok: false,
      code: 'MESSAGE_TOO_LONG',
      message: expect.any(String),
      maxLength: 16_000,
    });
    expect(ioEmits.some((event) => event.event === 'chat-message')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// chat-message rate limiting — asserts the PRODUCTION guard options, not a
// reconstruction of them. socket/rate-limit.js is not mocked in this file, so
// `handlers['chat-message']` IS the guarded wrapper handlers.js registered,
// spending tokens from the real env-configured chat bucket.
// ---------------------------------------------------------------------------
describe('chat-message rate limiting (production wiring)', () => {
  it('guards chat-message on the chat bucket with the production cost + rateLimitAck options', () => {
    const guardSpy = vi.spyOn(socketRateLimiter, 'guard');
    try {
      setup({ ...USER, id: 'user-guard-options' }, 'sock-guard-options');

      const chatGuard = guardSpy.mock.calls
        .find(([, bucket, event]) => bucket === 'chat' && event === 'chat-message');
      expect(chatGuard, 'handlers.js must guard chat-message on the chat bucket').toBeDefined();

      const options = chatGuard[4];
      expect(options, 'handlers.js must pass cost + rateLimitAck options').toBeDefined();

      // cost() is the size-weighted cost of the WHOLE payload — padding beyond
      // the text field is charged, so it cannot be a flat per-event 1.
      const small = { text: 'hello' };
      const padded = { text: 'ok', padding: 'x'.repeat(15_000) };
      expect(options.cost(small)).toBe(chatMessageTokenCost(small));
      expect(options.cost(padded)).toBe(chatMessageTokenCost(padded));
      expect(options.cost(padded)).toBeGreaterThan(options.cost(small));

      // rateLimitAck() mints exactly the locked wire shape, echoing retryAfterMs.
      const ack = options.rateLimitAck(1_234);
      expect(ack).toEqual({
        ok: false,
        code: 'RATE_LIMITED',
        message: expect.any(String),
        retryAfterMs: 1_234,
      });
      expect(ack.message.length).toBeGreaterThan(0);
    } finally {
      guardSpy.mockRestore();
    }
  });

  it('drops an over-budget send through the production guard and acks the locked RATE_LIMITED shape', () => {
    const { handlers, ioEmits } = setup(
      { ...USER, id: 'user-production-rate-limit' },
      'sock-production-rate-limit',
    );
    getUserRoom.mockReturnValue(ROOM);

    // Each send is deliberately big enough to cost several tokens, so the
    // bucket drains in a handful of calls no matter how fast the loop runs
    // (the limiter reads the real clock; refill over a few ms is negligible).
    const text = 'x'.repeat(4_000);
    const costPerSend = chatMessageTokenCost({ text });
    const { capacity } = env.rateLimit.socket.chat;
    const sends = Math.ceil(capacity / costPerSend) + 3;

    const acks = [];
    for (let i = 0; i < sends; i += 1) {
      handlers['chat-message']({ text: `${i}-${text}` }, (ack) => acks.push(ack));
    }

    const accepted = acks.filter((ack) => ack.ok);
    const denied = acks.filter((ack) => !ack.ok);
    expect(accepted.length).toBeGreaterThan(0);
    expect(denied.length).toBeGreaterThan(0);

    expect(denied[0]).toEqual({
      ok: false,
      code: 'RATE_LIMITED',
      message: expect.any(String),
      retryAfterMs: expect.any(Number),
    });
    expect(denied[0].message.length).toBeGreaterThan(0);
    expect(denied[0].retryAfterMs).toBeGreaterThan(0);

    // A denied send never reaches the room: exactly one broadcast per ok ack.
    expect(ioEmits.filter((e) => e.event === 'chat-message')).toHaveLength(accepted.length);
  });
});

// ---------------------------------------------------------------------------
// transcript-start
// ---------------------------------------------------------------------------
describe('transcript-start', () => {
  it('acks error when not in a room', async () => {
    const { handlers } = setup();
    getUserRoom.mockReturnValue(null);
    const cb = vi.fn();

    await handlers['transcript-start'](undefined, cb);

    expect(cb).toHaveBeenCalledWith({ error: expect.stringContaining('Not in a room') });
  });

  it('acks error when transcription is not configured', async () => {
    const { handlers } = setup();
    getUserRoom.mockReturnValue(ROOM);
    transcriptionConfigured.mockReturnValue(false);
    const cb = vi.fn();

    await handlers['transcript-start'](undefined, cb);

    expect(cb).toHaveBeenCalledWith({ error: expect.stringContaining('not configured') });
  });

  it('acks authorization error for a non-admin', async () => {
    const { handlers } = setup();
    getUserRoom.mockReturnValue(ROOM);
    isRoomAdmin.mockReturnValue(false);
    const cb = vi.fn();

    await handlers['transcript-start'](undefined, cb);

    expect(cb).toHaveBeenCalledWith({ error: expect.stringContaining('admin') });
  });

  it('starts transcript, emits transcript-state to room, acks ok for host', async () => {
    const { handlers, ioEmits } = setup();
    getUserRoom.mockReturnValue(ROOM);
    isRoomAdmin.mockReturnValue(true);
    const cb = vi.fn();

    await handlers['transcript-start'](undefined, cb);

    expect(startTranscript).toHaveBeenCalledWith(ROOM, USER);
    expect(ioEmits.some((e) => e.event === 'transcript-state')).toBe(true);
    expect(cb).toHaveBeenCalledWith({ ok: true, state: expect.anything() });
  });
});

// ---------------------------------------------------------------------------
// transcript-stop
// ---------------------------------------------------------------------------
describe('transcript-stop', () => {
  it('acks error when not in a room', async () => {
    const { handlers } = setup();
    getUserRoom.mockReturnValue(null);
    const cb = vi.fn();

    await handlers['transcript-stop'](undefined, cb);

    expect(cb).toHaveBeenCalledWith({ error: expect.stringContaining('Not in a room') });
  });

  it('acks authorization error for a non-admin', async () => {
    const { handlers } = setup();
    getUserRoom.mockReturnValue(ROOM);
    isRoomAdmin.mockReturnValue(false);
    const cb = vi.fn();

    await handlers['transcript-stop'](undefined, cb);

    expect(cb).toHaveBeenCalledWith({ error: expect.stringContaining('admin') });
  });

  it('stops transcript, emits transcript-state to room, acks ok for host', async () => {
    const { handlers, ioEmits } = setup();
    getUserRoom.mockReturnValue(ROOM);
    isRoomAdmin.mockReturnValue(true);
    stopRoomContributors.mockResolvedValue(undefined);
    const cb = vi.fn();

    await handlers['transcript-stop'](undefined, cb);

    expect(stopRoomContributors).toHaveBeenCalledWith(ROOM);
    expect(stopTranscript).toHaveBeenCalledWith(ROOM);
    expect(ioEmits.some((e) => e.event === 'transcript-state')).toBe(true);
    expect(cb).toHaveBeenCalledWith({ ok: true, state: expect.anything() });
  });
});

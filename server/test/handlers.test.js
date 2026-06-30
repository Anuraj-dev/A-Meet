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
});

// ---------------------------------------------------------------------------
// chat-message
// ---------------------------------------------------------------------------
describe('chat-message', () => {
  it('broadcasts chat-message to the room with sender + text + ts', () => {
    const { handlers, ioEmits } = setup();

    handlers['chat-message']({ roomId: ROOM, text: 'Hello' });

    const msg = ioEmits.find((e) => e.event === 'chat-message');
    expect(msg).toBeDefined();
    expect(msg.payload.sender).toEqual(USER);
    expect(msg.payload.text).toBe('Hello');
    expect(typeof msg.payload.ts).toBe('number');
  });

  it('ignores empty text', () => {
    const { handlers, ioEmits } = setup();
    handlers['chat-message']({ roomId: ROOM, text: '' });
    expect(ioEmits.some((e) => e.event === 'chat-message')).toBe(false);
  });

  it('ignores whitespace-only text', () => {
    const { handlers, ioEmits } = setup();
    handlers['chat-message']({ roomId: ROOM, text: '   ' });
    expect(ioEmits.some((e) => e.event === 'chat-message')).toBe(false);
  });

  it('ignores non-string text', () => {
    const { handlers, ioEmits } = setup();
    handlers['chat-message']({ roomId: ROOM, text: 42 });
    expect(ioEmits.some((e) => e.event === 'chat-message')).toBe(false);
  });

  it('ignores missing roomId', () => {
    const { handlers, ioEmits } = setup();
    handlers['chat-message']({ text: 'Hi' });
    expect(ioEmits.some((e) => e.event === 'chat-message')).toBe(false);
  });

  it('trims and caps text to 1000 characters', () => {
    const { handlers, ioEmits } = setup();
    const long = 'x'.repeat(1500);
    handlers['chat-message']({ roomId: ROOM, text: '  ' + long + '  ' });
    const msg = ioEmits.find((e) => e.event === 'chat-message');
    expect(msg.payload.text.length).toBe(1000);
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

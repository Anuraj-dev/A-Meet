// meeting-transcription.js — contributor orchestration layer.
// Deepgram session + Groq refiner + env + transcript-manager are all mocked so
// no real network calls happen. Tests drive the per-socket sessions Map through
// the module's public API and assert the observable effects.
//
// vi.resetModules() before each test is required because the module holds
// module-level state (sessions Map, refiner singleton). Resetting guarantees
// each test gets a clean slate without leaking cross-test state.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// All mocks must be declared before any import of the module under test.
// vi.mock() is hoisted, but the factory functions run at import time, so the
// factories must return stable references that we can update per-test via
// vi.mocked() / mockReturnValue etc.

vi.mock('../src/config/env.js', () => ({
  env: { transcription: { deepgramApiKey: 'test-key', groqApiKey: '' } },
}));

vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/socket/transcript-manager.js', () => ({
  appendTranscriptSegment: vi.fn(() => ({ entry: { id: 'seg-1', text: 'hi' } })),
  getTranscriptSnapshot: vi.fn(() => ({ entries: [], active: false })),
  reviseTranscriptSegment: vi.fn(),
}));

// vi.hoisted() runs before hoisted vi.mock() factories, so the references are
// safe to use inside the factory closures.
const { mockSessionInstance, mockRefinerInstance } = vi.hoisted(() => ({
  mockSessionInstance: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
  },
  mockRefinerInstance: { enabled: false, refine: vi.fn() },
}));

vi.mock('../src/transcription/deepgram-session.js', () => ({
  DeepgramMeetingSession: vi.fn(() => mockSessionInstance),
}));

vi.mock('../src/transcription/groq-refiner.js', () => ({
  GroqTranscriptRefiner: vi.fn(() => mockRefinerInstance),
}));

// Import the module under test AFTER all vi.mock() declarations.
import {
  transcriptionConfigured,
  startContributor,
  sendContributorAudio,
  stopContributor,
  stopRoomContributors,
} from '../src/transcription/meeting-transcription.js';
import { env } from '../src/config/env.js';
import { DeepgramMeetingSession } from '../src/transcription/deepgram-session.js';

const ROOM = 'room-1';
const USER = { id: 'user-1', name: 'Alice', avatar: '' };

function makeSocket(socketId = 'sock-1') {
  return {
    id: socketId,
    user: USER,
    emit: vi.fn(),
  };
}

function makeIo() {
  const emits = [];
  return {
    io: { to: vi.fn(() => ({ emit: (e, p) => emits.push({ event: e, payload: p }) })) },
    emits,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset session mock to resolved so each test starts clean.
  mockSessionInstance.start.mockResolvedValue(undefined);
  mockSessionInstance.stop.mockResolvedValue(undefined);
  mockSessionInstance.send.mockReset();
});

// We cannot use vi.resetModules() here because the module is already imported
// at the top level. Tests that need isolated sessions use unique socket IDs.
// The sessions Map persists across tests, so each test uses a unique socketId
// to avoid cross-test bleed (same pattern used in webrtc.test.js).
let _counter = 0;
const uid = () => `sock-${++_counter}`;

// ---------------------------------------------------------------------------
// transcriptionConfigured
// ---------------------------------------------------------------------------
describe('transcriptionConfigured', () => {
  it('returns true when deepgramApiKey is set', () => {
    env.transcription.deepgramApiKey = 'some-key';
    expect(transcriptionConfigured()).toBe(true);
  });

  it('returns false when deepgramApiKey is empty', () => {
    const orig = env.transcription.deepgramApiKey;
    env.transcription.deepgramApiKey = '';
    expect(transcriptionConfigured()).toBe(false);
    env.transcription.deepgramApiKey = orig;
  });
});

// ---------------------------------------------------------------------------
// startContributor
// ---------------------------------------------------------------------------
describe('startContributor', () => {
  it('opens a provider session for the socket', async () => {
    const socketId = uid();
    const { io } = makeIo();
    const socket = makeSocket(socketId);
    env.transcription.deepgramApiKey = 'key';

    await startContributor({ io, socket, roomId: ROOM });

    expect(DeepgramMeetingSession).toHaveBeenCalledWith(
      expect.objectContaining({ socketId }),
    );
    expect(mockSessionInstance.start).toHaveBeenCalledTimes(1);
  });

  it('does not double-open a session for the same socket', async () => {
    const socketId = uid();
    const { io } = makeIo();
    const socket = makeSocket(socketId);
    env.transcription.deepgramApiKey = 'key';

    await startContributor({ io, socket, roomId: ROOM });
    await startContributor({ io, socket, roomId: ROOM });

    // start() is only called once (second call is a no-op).
    expect(mockSessionInstance.start).toHaveBeenCalledTimes(1);
  });

  it('cleans up the sessions map if session.start() throws', async () => {
    const socketId = uid();
    const { io } = makeIo();
    const socket = makeSocket(socketId);
    env.transcription.deepgramApiKey = 'key';
    mockSessionInstance.start.mockRejectedValueOnce(new Error('provider down'));

    await expect(startContributor({ io, socket, roomId: ROOM })).rejects.toThrow('provider down');

    // After failure the socket should not be registered (sendContributorAudio returns false).
    expect(sendContributorAudio(socketId, Buffer.alloc(10))).toBe(false);
  });

  it('throws when transcription is not configured', async () => {
    const orig = env.transcription.deepgramApiKey;
    env.transcription.deepgramApiKey = '';
    const { io } = makeIo();
    const socket = makeSocket(uid());

    await expect(startContributor({ io, socket, roomId: ROOM }))
      .rejects.toThrow('not configured');

    env.transcription.deepgramApiKey = orig;
  });
});

// ---------------------------------------------------------------------------
// sendContributorAudio
// ---------------------------------------------------------------------------
describe('sendContributorAudio', () => {
  it('forwards audio to the session and returns true', async () => {
    const socketId = uid();
    const { io } = makeIo();
    const socket = makeSocket(socketId);
    env.transcription.deepgramApiKey = 'key';
    await startContributor({ io, socket, roomId: ROOM });

    const audio = Buffer.alloc(100, 0x10);
    const result = sendContributorAudio(socketId, audio);

    expect(result).toBe(true);
    expect(mockSessionInstance.send).toHaveBeenCalledWith(audio);
  });

  it('returns false for an unknown socket', () => {
    expect(sendContributorAudio('unknown-sock', Buffer.alloc(10))).toBe(false);
  });

  it('returns false for an oversized chunk (> 64 KB)', async () => {
    const socketId = uid();
    const { io } = makeIo();
    const socket = makeSocket(socketId);
    env.transcription.deepgramApiKey = 'key';
    await startContributor({ io, socket, roomId: ROOM });

    const big = Buffer.alloc(65 * 1024);
    const result = sendContributorAudio(socketId, big);

    expect(result).toBe(false);
    expect(mockSessionInstance.send).not.toHaveBeenCalled();
  });

  it('accepts a non-Buffer by converting it', async () => {
    const socketId = uid();
    const { io } = makeIo();
    const socket = makeSocket(socketId);
    env.transcription.deepgramApiKey = 'key';
    await startContributor({ io, socket, roomId: ROOM });

    const typed = new Uint8Array([1, 2, 3]);
    const result = sendContributorAudio(socketId, typed);

    expect(result).toBe(true);
    expect(mockSessionInstance.send).toHaveBeenCalledWith(Buffer.from(typed));
  });
});

// ---------------------------------------------------------------------------
// stopContributor
// ---------------------------------------------------------------------------
describe('stopContributor', () => {
  it('closes the session and removes the contributor', async () => {
    const socketId = uid();
    const { io } = makeIo();
    const socket = makeSocket(socketId);
    env.transcription.deepgramApiKey = 'key';
    await startContributor({ io, socket, roomId: ROOM });

    await stopContributor(socketId);

    expect(mockSessionInstance.stop).toHaveBeenCalledTimes(1);
    // After stopping, audio is rejected (contributor removed from map).
    expect(sendContributorAudio(socketId, Buffer.alloc(10))).toBe(false);
  });

  it('is safe to call when no contributor exists', async () => {
    await expect(stopContributor('no-such-socket')).resolves.not.toThrow();
    expect(mockSessionInstance.stop).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// stopRoomContributors
// ---------------------------------------------------------------------------
describe('stopRoomContributors', () => {
  it('closes every contributor in the room', async () => {
    const ROOM2 = 'room-2';
    const sockA = uid();
    const sockB = uid();
    const sockC = uid(); // different room — should NOT be stopped
    const { io } = makeIo();
    env.transcription.deepgramApiKey = 'key';

    await startContributor({ io, socket: makeSocket(sockA), roomId: ROOM2 });
    await startContributor({ io, socket: makeSocket(sockB), roomId: ROOM2 });
    await startContributor({ io, socket: makeSocket(sockC), roomId: 'other-room' });

    // Reset call count after the three starts.
    mockSessionInstance.stop.mockClear();

    await stopRoomContributors(ROOM2);

    // Two stops for ROOM2, none for sockC's room.
    expect(mockSessionInstance.stop).toHaveBeenCalledTimes(2);
    // ROOM2 contributors are gone; other-room contributor is still active.
    expect(sendContributorAudio(sockA, Buffer.alloc(10))).toBe(false);
    expect(sendContributorAudio(sockB, Buffer.alloc(10))).toBe(false);
    expect(sendContributorAudio(sockC, Buffer.alloc(10))).toBe(true);
  });

  it('is a no-op when no contributors exist for the room', async () => {
    await expect(stopRoomContributors('empty-room')).resolves.not.toThrow();
  });
});

// WebRTC mesh signaling relay (server/src/socket/webrtc.js).
// Capture-and-invoke pattern: fake socket records handlers via .on(), tests
// invoke captured callbacks with crafted payloads and assert emitted events.
// No DB, no mediasoup, no real network — pure in-memory relay state.
//
// Important: webrtc.js holds module-level Maps (readyRooms, socketReadyRoom).
// Each test uses unique roomIds / socketIds to avoid cross-test state bleed,
// since vi.resetModules() between tests would be too slow.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { registerWebrtcHandlers } from '../src/socket/webrtc.js';

const USER = { id: 'user-1', name: 'Alice' };

// Unique room/socket id per test to avoid module-level map bleed.
let _counter = 0;
const uid = () => `id-${++_counter}`;

function makeSocket(user = USER, socketId = uid()) {
  const handlers = {};
  const socketEmits = [];
  const socket = {
    id: socketId,
    user,
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    emit: vi.fn((event, payload) => socketEmits.push({ event, payload })),
    to: vi.fn((target) => ({
      emit: (event, payload) => socketEmits.push({ target, event, payload }),
    })),
  };
  return { socket, handlers, socketEmits };
}

function makeIo() {
  const ioEmits = [];
  const io = {
    to: vi.fn((target) => ({
      emit: (event, payload) => ioEmits.push({ target, event, payload }),
    })),
  };
  return { io, ioEmits };
}

// Register handlers on a fresh socket and return everything needed to invoke them.
function setup(user = USER, socketId = uid()) {
  const { io, ioEmits } = makeIo();
  const { socket, handlers, socketEmits } = makeSocket(user, socketId);
  registerWebrtcHandlers(io, socket);
  return { io, ioEmits, socket, handlers, socketEmits };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// webrtc-ready
// ---------------------------------------------------------------------------
describe('webrtc-ready', () => {
  it('ignores a non-string roomId', () => {
    const { handlers, socketEmits } = setup();
    handlers['webrtc-ready'](42);
    expect(socketEmits.some((e) => e.event === 'webrtc-peers')).toBe(false);
  });

  it('ignores an empty roomId', () => {
    const { handlers, socketEmits } = setup();
    handlers['webrtc-ready']('');
    expect(socketEmits.some((e) => e.event === 'webrtc-peers')).toBe(false);
  });

  it('replies to the first joiner with an empty peers list (self excluded)', () => {
    const ROOM = uid();
    const { handlers, socketEmits } = setup();
    handlers['webrtc-ready'](ROOM);
    const msg = socketEmits.find((e) => e.event === 'webrtc-peers');
    expect(msg).toBeDefined();
    expect(msg.payload).toEqual([]);
  });

  it('second peer sees the first in its webrtc-peers list', () => {
    const ROOM = uid();
    const sockA = uid();
    const sockB = uid();
    const { handlers: hA } = setup(USER, sockA);
    const { handlers: hB, socketEmits: emitsB } = setup(USER, sockB);

    hA['webrtc-ready'](ROOM);
    hB['webrtc-ready'](ROOM);

    const msg = emitsB.find((e) => e.event === 'webrtc-peers');
    expect(msg).toBeDefined();
    expect(msg.payload).toContain(sockA);
    expect(msg.payload).not.toContain(sockB);
  });

  it('first peer does NOT see the second (list is snapshot at join time)', () => {
    const ROOM = uid();
    const sockA = uid();
    const sockB = uid();
    const { handlers: hA, socketEmits: emitsA } = setup(USER, sockA);
    const { handlers: hB } = setup(USER, sockB);

    hA['webrtc-ready'](ROOM);
    hB['webrtc-ready'](ROOM);

    const msg = emitsA.find((e) => e.event === 'webrtc-peers');
    expect(msg.payload).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// webrtc-offer
// ---------------------------------------------------------------------------
describe('webrtc-offer', () => {
  it('ignores a payload without `to`', () => {
    const { handlers, ioEmits } = setup();
    handlers['webrtc-offer']({ description: { sdp: 'x' } });
    expect(ioEmits.some((e) => e.event === 'webrtc-offer')).toBe(false);
  });

  it('ignores a payload without `description`', () => {
    const { handlers, ioEmits } = setup();
    handlers['webrtc-offer']({ to: uid() });
    expect(ioEmits.some((e) => e.event === 'webrtc-offer')).toBe(false);
  });

  it('relays the offer to the target socket, stamping from: socket.id', () => {
    const { handlers, socket, ioEmits } = setup();
    const target = uid();
    const desc = { type: 'offer', sdp: 'v=0' };

    handlers['webrtc-offer']({ to: target, description: desc });

    const msg = ioEmits.find((e) => e.event === 'webrtc-offer');
    expect(msg).toBeDefined();
    expect(msg.target).toBe(target);
    expect(msg.payload).toEqual({ from: socket.id, description: desc });
  });
});

// ---------------------------------------------------------------------------
// webrtc-answer
// ---------------------------------------------------------------------------
describe('webrtc-answer', () => {
  it('ignores a payload without `to`', () => {
    const { handlers, ioEmits } = setup();
    handlers['webrtc-answer']({ description: { sdp: 'x' } });
    expect(ioEmits.some((e) => e.event === 'webrtc-answer')).toBe(false);
  });

  it('ignores a payload without `description`', () => {
    const { handlers, ioEmits } = setup();
    handlers['webrtc-answer']({ to: uid() });
    expect(ioEmits.some((e) => e.event === 'webrtc-answer')).toBe(false);
  });

  it('relays the answer to the target socket, stamping from: socket.id', () => {
    const { handlers, socket, ioEmits } = setup();
    const target = uid();
    const desc = { type: 'answer', sdp: 'v=0' };

    handlers['webrtc-answer']({ to: target, description: desc });

    const msg = ioEmits.find((e) => e.event === 'webrtc-answer');
    expect(msg).toBeDefined();
    expect(msg.target).toBe(target);
    expect(msg.payload).toEqual({ from: socket.id, description: desc });
  });
});

// ---------------------------------------------------------------------------
// webrtc-ice-candidate
// ---------------------------------------------------------------------------
describe('webrtc-ice-candidate', () => {
  it('ignores a payload without `to`', () => {
    const { handlers, ioEmits } = setup();
    handlers['webrtc-ice-candidate']({ candidate: { c: 1 } });
    expect(ioEmits.some((e) => e.event === 'webrtc-ice-candidate')).toBe(false);
  });

  it('ignores a payload without `candidate`', () => {
    const { handlers, ioEmits } = setup();
    handlers['webrtc-ice-candidate']({ to: uid() });
    expect(ioEmits.some((e) => e.event === 'webrtc-ice-candidate')).toBe(false);
  });

  it('relays the ICE candidate to the target socket, stamping from: socket.id', () => {
    const { handlers, socket, ioEmits } = setup();
    const target = uid();
    const cand = { candidate: 'candidate:1 ...', sdpMid: '0' };

    handlers['webrtc-ice-candidate']({ to: target, candidate: cand });

    const msg = ioEmits.find((e) => e.event === 'webrtc-ice-candidate');
    expect(msg).toBeDefined();
    expect(msg.target).toBe(target);
    expect(msg.payload).toEqual({ from: socket.id, candidate: cand });
  });
});

// ---------------------------------------------------------------------------
// webrtc-media-state
// ---------------------------------------------------------------------------
describe('webrtc-media-state', () => {
  it('sends targeted to `to` when set', () => {
    const { handlers, socket, ioEmits } = setup();
    const target = uid();

    handlers['webrtc-media-state']({ to: target, video: true, audio: false });

    const msg = ioEmits.find((e) => e.event === 'webrtc-media-state');
    expect(msg).toBeDefined();
    expect(msg.target).toBe(target);
    expect(msg.payload).toEqual({
      socketId: socket.id,
      user: USER,
      video: true,
      audio: false,
    });
  });

  it('broadcasts to the ready-room via socket.to when `to` is absent', () => {
    const ROOM = uid();
    const { handlers, socket, socketEmits } = setup();

    // Must be in a ready-room first.
    handlers['webrtc-ready'](ROOM);

    handlers['webrtc-media-state']({ video: false, audio: true });

    const msg = socketEmits.find((e) => e.event === 'webrtc-media-state');
    expect(msg).toBeDefined();
    expect(msg.target).toBe(ROOM);
    expect(msg.payload).toEqual({
      socketId: socket.id,
      user: USER,
      video: false,
      audio: true,
    });
  });

  it('coerces video/audio to booleans', () => {
    const { handlers, ioEmits } = setup();
    handlers['webrtc-media-state']({ to: uid(), video: 1, audio: 0 });
    const msg = ioEmits.find((e) => e.event === 'webrtc-media-state');
    expect(msg.payload.video).toBe(true);
    expect(msg.payload.audio).toBe(false);
  });

  it('does nothing when `to` is absent and socket is not in a ready-room', () => {
    const { handlers, socketEmits, ioEmits } = setup();
    handlers['webrtc-media-state']({ video: true, audio: true });
    expect([...socketEmits, ...ioEmits].some((e) => e.event === 'webrtc-media-state')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------
describe('disconnect', () => {
  it('does nothing when the socket was never in a ready-room', () => {
    const { handlers, socketEmits } = setup();
    handlers['disconnect']();
    expect(socketEmits.some((e) => e.event === 'webrtc-peer-left')).toBe(false);
  });

  it('emits webrtc-peer-left to the room on disconnect', () => {
    const ROOM = uid();
    const { handlers, socket, socketEmits } = setup();

    handlers['webrtc-ready'](ROOM);
    handlers['disconnect']();

    const msg = socketEmits.find((e) => e.event === 'webrtc-peer-left');
    expect(msg).toBeDefined();
    expect(msg.target).toBe(ROOM);
    expect(msg.payload).toEqual({ socketId: socket.id });
  });

  it('cleans up the ready-room so a later socket sees an empty peers list', () => {
    const ROOM = uid();
    const sockA = uid();
    const sockB = uid();
    const { handlers: hA } = setup(USER, sockA);
    const { handlers: hB, socketEmits: emitsB } = setup(USER, sockB);

    // A joins, A disconnects, B joins — B should see an empty list.
    hA['webrtc-ready'](ROOM);
    hA['disconnect']();
    hB['webrtc-ready'](ROOM);

    const msg = emitsB.find((e) => e.event === 'webrtc-peers');
    expect(msg.payload).toEqual([]);
  });

  it('does not emit webrtc-peer-left a second time if disconnect fires twice', () => {
    const ROOM = uid();
    const { handlers, socketEmits } = setup();

    handlers['webrtc-ready'](ROOM);
    handlers['disconnect']();
    handlers['disconnect']();

    const peerLeftEvents = socketEmits.filter((e) => e.event === 'webrtc-peer-left');
    expect(peerLeftEvents).toHaveLength(1);
  });
});

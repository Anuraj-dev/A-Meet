// Host-moderation authorization for the SFU signaling handlers — the app's core
// trust boundary. We use the "capture-and-invoke" pattern: register the handlers
// on a fake socket that records each `.on(event, cb)`, seed the module's
// socket→room map by driving `sfu-get-rtp-capabilities`, then invoke the captured
// moderation callbacks and assert EXTERNAL effects (producer pause/close, emits,
// disconnect) — proving a non-host caller is always a no-op.
//
// No real mediasoup worker and no DB: the room store and logger are mocked, and
// the host vs non-host branch is driven by stubbing `Room.findOne` (the real,
// already-tested `isRoomAdmin` runs against it).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/sfu/sfu-rooms.js', () => ({
  getOrCreateRoom: vi.fn(),
  getRoom: vi.fn(),
  addPeer: vi.fn(),
  getPeer: vi.fn(),
  listOtherProducers: vi.fn(),
  removePeer: vi.fn(),
  closeRoomIfEmpty: vi.fn(),
}));
vi.mock('../src/models/Room.js', () => ({
  Room: { findOne: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { registerSfuHandlers } from '../src/socket/sfu-handlers.js';
import { getOrCreateRoom, getRoom, getPeer } from '../src/sfu/sfu-rooms.js';
import { addUser, removeUser } from '../src/socket/room-manager.js';
import { Room } from '../src/models/Room.js';

const ROOM = 'room-1';
const HOST_ID = 'host-user';
const TARGET = 'target-sock';

// Build a fake io/socket pair that records every emit with its target channel.
function setup({ userId, socketId = 'caller-sock' } = {}) {
  const handlers = {};
  const ioEmits = [];
  const socketEmits = [];

  const socket = {
    id: socketId,
    user: { id: userId, name: 'Caller' },
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    join: vi.fn(),
    emit: vi.fn(),
    to: vi.fn((target) => ({ emit: (event, payload) => socketEmits.push({ target, event, payload }) })),
    disconnect: vi.fn(),
  };

  const io = {
    to: vi.fn((target) => ({ emit: (event, payload) => ioEmits.push({ target, event, payload }) })),
    in: vi.fn((target) => ({ emit: (event, payload) => ioEmits.push({ target, event, payload }) })),
    sockets: { sockets: { get: vi.fn() } },
  };

  registerSfuHandlers(io, socket);
  return { handlers, socket, io, ioEmits, socketEmits };
}

// Seed the module's socketRoom map for the caller via the real entry handler.
async function joinRoom(handlers) {
  await handlers['sfu-get-rtp-capabilities']({ roomId: ROOM }, () => {});
}

// Make the caller the host (or not) for the DB-backed authorization check.
function asHost() { Room.findOne.mockResolvedValue({ admin: HOST_ID }); }
function asNonHost() { Room.findOne.mockResolvedValue({ admin: 'someone-else' }); }

// A live primary-mic producer for a target peer, with spied pause/resume/close.
function makeMicPeer() {
  const producer = {
    id: 'aud-1', kind: 'audio', appData: {}, paused: false,
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };
  return { peer: { producers: new Map([[producer.id, producer]]) }, producer };
}

const emittedTo = (emits, target, event) => emits.some((e) => e.target === target && e.event === event);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  // get-rtp-capabilities only needs a room with a router and an existing
  // audioLevelObserver (truthy → skip the observer-creation branch).
  getOrCreateRoom.mockResolvedValue({ router: { rtpCapabilities: {} }, audioLevelObserver: {} });
});

describe('SFU host-moderation authorization', () => {
  describe('sfu-host-mute', () => {
    it('host: pauses the target mic and broadcasts the mute + force-muted', async () => {
      const { handlers, ioEmits } = setup({ userId: HOST_ID });
      await joinRoom(handlers);
      asHost();
      const { peer, producer } = makeMicPeer();
      getPeer.mockImplementation((_room, sid) => (sid === TARGET ? peer : null));

      await handlers['sfu-host-mute']({ socketId: TARGET });

      expect(producer.pause).toHaveBeenCalledTimes(1);
      expect(emittedTo(ioEmits, ROOM, 'sfu-producer-paused')).toBe(true);
      expect(emittedTo(ioEmits, TARGET, 'sfu-force-muted')).toBe(true);
    });

    it('non-host: does nothing (no pause, no emit)', async () => {
      const { handlers, ioEmits } = setup({ userId: 'rando' });
      await joinRoom(handlers);
      asNonHost();
      const { peer, producer } = makeMicPeer();
      getPeer.mockImplementation((_room, sid) => (sid === TARGET ? peer : null));

      await handlers['sfu-host-mute']({ socketId: TARGET });

      expect(producer.pause).not.toHaveBeenCalled();
      expect(emittedTo(ioEmits, TARGET, 'sfu-force-muted')).toBe(false);
    });

    it('host: muting yourself is a no-op', async () => {
      const { handlers, ioEmits } = setup({ userId: HOST_ID });
      await joinRoom(handlers);
      asHost();

      await handlers['sfu-host-mute']({ socketId: 'caller-sock' });

      expect(emittedTo(ioEmits, 'caller-sock', 'sfu-force-muted')).toBe(false);
    });
  });

  describe('sfu-mute-all', () => {
    it('host: mutes every peer except the host', async () => {
      const { handlers } = setup({ userId: HOST_ID });
      await joinRoom(handlers);
      asHost();
      const t1 = makeMicPeer();
      const t2 = makeMicPeer();
      getRoom.mockReturnValue({ peers: new Map([['caller-sock', {}], ['t1', {}], ['t2', {}]]) });
      getPeer.mockImplementation((_room, sid) => {
        if (sid === 't1') return t1.peer;
        if (sid === 't2') return t2.peer;
        return null;
      });

      await handlers['sfu-mute-all']();

      expect(t1.producer.pause).toHaveBeenCalledTimes(1);
      expect(t2.producer.pause).toHaveBeenCalledTimes(1);
    });

    it('non-host: mutes no one', async () => {
      const { handlers } = setup({ userId: 'rando' });
      await joinRoom(handlers);
      asNonHost();
      const t1 = makeMicPeer();
      getRoom.mockReturnValue({ peers: new Map([['caller-sock', {}], ['t1', {}]]) });
      getPeer.mockImplementation((_room, sid) => (sid === 't1' ? t1.peer : null));

      await handlers['sfu-mute-all']();

      expect(t1.producer.pause).not.toHaveBeenCalled();
    });
  });

  describe('sfu-request-unmute', () => {
    it('host: only sends an unmute request — never force-resumes the mic', async () => {
      const { handlers, ioEmits } = setup({ userId: HOST_ID });
      await joinRoom(handlers);
      asHost();
      const { peer, producer } = makeMicPeer();
      getPeer.mockImplementation((_room, sid) => (sid === TARGET ? peer : null));

      await handlers['sfu-request-unmute']({ socketId: TARGET });

      expect(emittedTo(ioEmits, TARGET, 'sfu-unmute-request')).toBe(true);
      expect(producer.resume).not.toHaveBeenCalled();
    });

    it('non-host: sends no unmute request', async () => {
      const { handlers, ioEmits } = setup({ userId: 'rando' });
      await joinRoom(handlers);
      asNonHost();

      await handlers['sfu-request-unmute']({ socketId: TARGET });

      expect(emittedTo(ioEmits, TARGET, 'sfu-unmute-request')).toBe(false);
    });
  });

  describe('sfu-request-unmute-all', () => {
    it('host: broadcasts an unmute request to the room — never touches any producer', async () => {
      const { handlers, socketEmits } = setup({ userId: HOST_ID });
      await joinRoom(handlers);
      asHost();
      // Wire real (paused) producers into the room state. The prompt-only
      // contract means the handler must never even reach for them.
      const t1 = makeMicPeer();
      const t2 = makeMicPeer();
      t1.producer.paused = true;
      t2.producer.paused = true;
      getRoom.mockReturnValue({ peers: new Map([['caller-sock', {}], ['t1', {}], ['t2', {}]]) });
      getPeer.mockImplementation((_room, sid) => {
        if (sid === 't1') return t1.peer;
        if (sid === 't2') return t2.peer;
        return null;
      });
      // Only count lookups made by the handler under test (joinRoom is setup).
      getRoom.mockClear();
      getPeer.mockClear();

      await handlers['sfu-request-unmute-all']();

      // Sent room-wide via `socket.to(roomId)` (excludes the host themselves),
      // carrying who asked so the target's prompt can name the requester.
      const evt = socketEmits.find((e) => e.target === ROOM && e.event === 'sfu-unmute-request');
      expect(evt?.payload).toEqual({ by: 'Caller' });
      // Consent-based: the handler performs NO peer/producer operations at all —
      // it never looks up room peers, and no producer is resumed or paused.
      expect(getRoom).not.toHaveBeenCalled();
      expect(getPeer).not.toHaveBeenCalled();
      for (const { producer } of [t1, t2]) {
        expect(producer.resume).not.toHaveBeenCalled();
        expect(producer.pause).not.toHaveBeenCalled();
      }
    });

    it('non-host: broadcasts no unmute request', async () => {
      const { handlers, socketEmits } = setup({ userId: 'rando' });
      await joinRoom(handlers);
      asNonHost();

      await handlers['sfu-request-unmute-all']();

      expect(emittedTo(socketEmits, ROOM, 'sfu-unmute-request')).toBe(false);
    });
  });

  describe('sfu-host-remove', () => {
    // The target must be a presence member of the host's room. Seed/clean it.
    beforeEach(() => addUser(ROOM, TARGET, { id: 'target-user', name: 'Target' }));
    afterEach(() => removeUser(TARGET));

    it('host: notifies the target and disconnects their socket', async () => {
      vi.useFakeTimers();
      const { handlers, io, ioEmits } = setup({ userId: HOST_ID });
      await joinRoom(handlers);
      asHost();
      const targetSocket = { disconnect: vi.fn() };
      io.sockets.sockets.get.mockReturnValue(targetSocket);

      await handlers['sfu-host-remove']({ socketId: TARGET });

      expect(emittedTo(ioEmits, TARGET, 'sfu-removed')).toBe(true);
      // Disconnect is deferred ~250ms so the notification can flush first.
      expect(targetSocket.disconnect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(250);
      expect(targetSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('host: cannot remove a socket that belongs to another room', async () => {
      const { handlers, io, ioEmits } = setup({ userId: HOST_ID });
      await joinRoom(handlers); // caller hosts ROOM
      asHost();
      // Move the target into a DIFFERENT room's presence.
      removeUser(TARGET);
      addUser('other-room', TARGET, { id: 'target-user', name: 'Target' });

      await handlers['sfu-host-remove']({ socketId: TARGET });

      expect(emittedTo(ioEmits, TARGET, 'sfu-removed')).toBe(false);
      expect(io.sockets.sockets.get).not.toHaveBeenCalled();
    });

    it('non-host: neither notifies nor disconnects', async () => {
      const { handlers, io, ioEmits } = setup({ userId: 'rando' });
      await joinRoom(handlers);
      asNonHost();

      await handlers['sfu-host-remove']({ socketId: TARGET });

      expect(emittedTo(ioEmits, TARGET, 'sfu-removed')).toBe(false);
      expect(io.sockets.sockets.get).not.toHaveBeenCalled();
    });
  });

  describe('sfu-spotlight', () => {
    it('host: relays the spotlight target to everyone', async () => {
      const { handlers, ioEmits } = setup({ userId: HOST_ID });
      await joinRoom(handlers);
      asHost();

      await handlers['sfu-spotlight']({ socketId: TARGET });

      const evt = ioEmits.find((e) => e.target === ROOM && e.event === 'sfu-spotlight');
      expect(evt?.payload).toEqual({ socketId: TARGET });
    });

    it('host: clears the spotlight on a null payload', async () => {
      const { handlers, ioEmits } = setup({ userId: HOST_ID });
      await joinRoom(handlers);
      asHost();

      await handlers['sfu-spotlight']({});

      const evt = ioEmits.find((e) => e.target === ROOM && e.event === 'sfu-spotlight');
      expect(evt?.payload).toEqual({ socketId: null });
    });

    it('non-host: relays nothing', async () => {
      const { handlers, ioEmits } = setup({ userId: 'rando' });
      await joinRoom(handlers);
      asNonHost();

      await handlers['sfu-spotlight']({ socketId: TARGET });

      expect(emittedTo(ioEmits, ROOM, 'sfu-spotlight')).toBe(false);
    });
  });

  // With the SFU disabled (E2E harness, or before the media handshake), the SFU
  // `socketRoom` map is never populated. Moderation must still resolve the
  // caller's room from canonical presence (room-manager) so host-relayed actions
  // — spotlight + remove — work without any media. Mute is excluded here: it is
  // an enforced producer pause, which genuinely requires the SFU.
  describe('host moderation on the SFU-off path (presence room fallback)', () => {
    const PRESENCE_SOCK = 'presence-only-sock';

    // Seed ONLY room-manager presence (no sfu-get-rtp-capabilities), so the SFU
    // socketRoom stays empty and callerIsHost must fall back to getUserRoom.
    beforeEach(() => addUser(ROOM, PRESENCE_SOCK, { id: HOST_ID, name: 'Host' }));
    afterEach(() => removeUser(PRESENCE_SOCK));

    it('host-remove ejects the target via presence even with the SFU off', async () => {
      addUser(ROOM, TARGET, { id: 'target-user', name: 'Target' });
      const { handlers, io, ioEmits } = setup({ userId: HOST_ID, socketId: PRESENCE_SOCK });
      asHost();
      const targetSocket = { disconnect: vi.fn() };
      io.sockets.sockets.get.mockReturnValue(targetSocket);

      await handlers['sfu-host-remove']({ socketId: TARGET });

      expect(emittedTo(ioEmits, TARGET, 'sfu-removed')).toBe(true);
      removeUser(TARGET);
    });

    it('host-spotlight relays to the room via presence even with the SFU off', async () => {
      const { handlers, ioEmits } = setup({ userId: HOST_ID, socketId: PRESENCE_SOCK });
      asHost();

      await handlers['sfu-spotlight']({ socketId: TARGET });

      const evt = ioEmits.find((e) => e.target === ROOM && e.event === 'sfu-spotlight');
      expect(evt?.payload).toEqual({ socketId: TARGET });
    });

    it('non-host on the SFU-off path still cannot moderate', async () => {
      const { handlers, ioEmits } = setup({ userId: 'rando', socketId: PRESENCE_SOCK });
      asNonHost();

      await handlers['sfu-host-remove']({ socketId: TARGET });
      await handlers['sfu-spotlight']({ socketId: TARGET });

      expect(emittedTo(ioEmits, TARGET, 'sfu-removed')).toBe(false);
      expect(emittedTo(ioEmits, ROOM, 'sfu-spotlight')).toBe(false);
    });
  });

  describe('sfu-end-meeting', () => {
    it('host: notifies the room and marks the room inactive', async () => {
      const { handlers, ioEmits } = setup({ userId: HOST_ID });
      await joinRoom(handlers);
      asHost();
      Room.updateOne.mockResolvedValue({});

      await handlers['sfu-end-meeting']();

      expect(emittedTo(ioEmits, ROOM, 'sfu-meeting-ended')).toBe(true);
      expect(Room.updateOne).toHaveBeenCalledWith({ roomId: ROOM }, { $set: { active: false } });
    });

    it('non-host: neither ends the meeting nor mutates the room', async () => {
      const { handlers, ioEmits } = setup({ userId: 'rando' });
      await joinRoom(handlers);
      asNonHost();

      await handlers['sfu-end-meeting']();

      expect(emittedTo(ioEmits, ROOM, 'sfu-meeting-ended')).toBe(false);
      expect(Room.updateOne).not.toHaveBeenCalled();
    });
  });
});

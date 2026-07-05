// Input validation + per-peer resource caps for the SFU signaling handlers.
// The socket layer used to accept any non-empty string as a roomId and let
// mediasoup lazily mint a real Router for it, with no per-peer transport/producer
// ceiling — an authenticated peer could exhaust worker resources (DoS). These
// tests pin the guard: roomId must match the REST room-code format AND exist as
// an active room before a Router is created, every SFU payload is schema-checked,
// and transports/producers are capped per peer.
//
// Same capture-and-invoke harness as the other sfu-handlers tests: a fake socket
// records each `.on(event, cb)`; we invoke the captured callbacks and assert
// external effects (acks, and whether mediasoup/store functions were called).

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { Room } from '../src/models/Room.js';
import { MAX_TRANSPORTS_PER_PEER, MAX_PRODUCERS_PER_PEER } from '../src/sfu/config.js';

// A well-formed Google Meet-style code (xxx-xxxx-xxx), matching the REST layer.
const ROOM = 'abc-defg-hij';

function setup({ socketId = 'caller-sock' } = {}) {
  const handlers = {};
  const socketEmits = [];
  const socket = {
    id: socketId,
    user: { id: 'user-1', name: 'Caller' },
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    join: vi.fn(),
    emit: vi.fn(),
    to: vi.fn((target) => ({ emit: (event, payload) => socketEmits.push({ target, event, payload }) })),
  };
  const io = {
    to: vi.fn(() => ({ emit: vi.fn() })),
    in: vi.fn(() => ({ emit: vi.fn() })),
    sockets: { sockets: { get: vi.fn() } },
  };
  registerSfuHandlers(io, socket);
  return { handlers, socket, io, socketEmits };
}

function makeRoom() {
  const transport = {
    id: `trans-${Math.random()}`,
    iceParameters: {}, iceCandidates: [], dtlsParameters: {},
    on: vi.fn(),
    produce: vi.fn(),
    close: vi.fn(),
  };
  const router = {
    rtpCapabilities: { codecs: [] },
    createWebRtcTransport: vi.fn().mockResolvedValue(transport),
    createAudioLevelObserver: vi.fn(),
  };
  return { router, audioLevelObserver: {}, audioProducerToSocket: new Map(), peers: new Map() };
}

// Seed the socketRoom map by driving a successful join (valid + active room).
async function joinRoom(handlers, room) {
  Room.findOne.mockResolvedValue({ active: true, admin: 'user-1' });
  getOrCreateRoom.mockResolvedValue(room);
  await handlers['sfu-get-rtp-capabilities']({ roomId: ROOM }, vi.fn());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SFU roomId validation before minting a Router', () => {
  it('rejects a malformed roomId and never mints a Router', async () => {
    const { handlers } = setup();
    const cb = vi.fn();

    await handlers['sfu-get-rtp-capabilities']({ roomId: 'totally-not-a-code' }, cb);

    expect(getOrCreateRoom).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('rejects an empty roomId and never mints a Router', async () => {
    const { handlers } = setup();
    const cb = vi.fn();

    await handlers['sfu-get-rtp-capabilities']({ roomId: '' }, cb);

    expect(getOrCreateRoom).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('rejects a well-formed code that does not exist in the DB', async () => {
    const { handlers } = setup();
    Room.findOne.mockResolvedValue(null);
    const cb = vi.fn();

    await handlers['sfu-get-rtp-capabilities']({ roomId: ROOM }, cb);

    expect(Room.findOne).toHaveBeenCalledWith({ roomId: ROOM });
    expect(getOrCreateRoom).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('rejects a room that exists but has ended (active:false)', async () => {
    const { handlers } = setup();
    Room.findOne.mockResolvedValue({ active: false });
    const cb = vi.fn();

    await handlers['sfu-get-rtp-capabilities']({ roomId: ROOM }, cb);

    expect(getOrCreateRoom).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('accepts a valid, active room and mints the Router', async () => {
    const { handlers } = setup();
    const room = makeRoom();
    Room.findOne.mockResolvedValue({ active: true });
    getOrCreateRoom.mockResolvedValue(room);
    const cb = vi.fn();

    await handlers['sfu-get-rtp-capabilities']({ roomId: ROOM }, cb);

    expect(getOrCreateRoom).toHaveBeenCalledWith(ROOM);
    expect(cb).toHaveBeenCalledWith({ rtpCapabilities: room.router.rtpCapabilities });
  });

  it('normalizes an uppercased code to lowercase (mirrors the REST lookup)', async () => {
    const { handlers } = setup();
    const room = makeRoom();
    Room.findOne.mockResolvedValue({ active: true });
    getOrCreateRoom.mockResolvedValue(room);

    await handlers['sfu-get-rtp-capabilities']({ roomId: 'ABC-DEFG-HIJ' }, vi.fn());

    expect(Room.findOne).toHaveBeenCalledWith({ roomId: ROOM });
    expect(getOrCreateRoom).toHaveBeenCalledWith(ROOM);
  });
});

describe('SFU payload schema validation', () => {
  it('sfu-produce rejects an unknown media kind', async () => {
    const { handlers } = setup();
    const room = makeRoom();
    const peer = { transports: new Map([['t1', {}]]), producers: new Map() };
    await joinRoom(handlers, room);
    getRoom.mockReturnValue(room);
    getPeer.mockReturnValue(peer);
    const cb = vi.fn();

    await handlers['sfu-produce']({ transportId: 't1', kind: 'hologram', rtpParameters: {} }, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('sfu-consume rejects a missing producerId', async () => {
    const { handlers } = setup();
    const room = makeRoom();
    await joinRoom(handlers, room);
    getRoom.mockReturnValue(room);
    getPeer.mockReturnValue({ transports: new Map(), consumers: new Map() });
    const cb = vi.fn();

    await handlers['sfu-consume']({ transportId: 't1', rtpCapabilities: {} }, cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('sfu-create-transport rejects a non-string direction before touching the router', async () => {
    const { handlers } = setup();
    const room = makeRoom();
    const peer = { transports: new Map(), producers: new Map() };
    await joinRoom(handlers, room);
    getRoom.mockReturnValue(room);
    getPeer.mockReturnValue(peer);
    const cb = vi.fn();

    await handlers['sfu-create-transport']({ direction: 42 }, cb);

    expect(room.router.createWebRtcTransport).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
});

describe('SFU per-peer resource caps (DoS guard)', () => {
  it('caps transports per peer', async () => {
    const { handlers } = setup();
    const room = makeRoom();
    // Peer already at the cap.
    const peer = { transports: new Map(), producers: new Map() };
    for (let i = 0; i < MAX_TRANSPORTS_PER_PEER; i++) peer.transports.set(`t${i}`, {});
    await joinRoom(handlers, room);
    getRoom.mockReturnValue(room);
    getPeer.mockReturnValue(peer);
    const cb = vi.fn();

    await handlers['sfu-create-transport']({ direction: 'send' }, cb);

    expect(room.router.createWebRtcTransport).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('caps producers per peer', async () => {
    const { handlers } = setup();
    const room = makeRoom();
    const transport = { id: 't1', produce: vi.fn().mockResolvedValue({ id: 'p', kind: 'video', appData: {}, on: vi.fn() }) };
    const peer = { transports: new Map([['t1', transport]]), producers: new Map() };
    for (let i = 0; i < MAX_PRODUCERS_PER_PEER; i++) peer.producers.set(`p${i}`, {});
    await joinRoom(handlers, room);
    getRoom.mockReturnValue(room);
    getPeer.mockReturnValue(peer);
    const cb = vi.fn();

    await handlers['sfu-produce']({ transportId: 't1', kind: 'video', rtpParameters: {}, appData: {} }, cb);

    expect(transport.produce).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
});

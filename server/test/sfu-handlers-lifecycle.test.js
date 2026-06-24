// SFU lifecycle / signaling-glue handlers in server/src/socket/sfu-handlers.js,
// tested against mocked mediasoup so transport/producer/consumer setup and
// teardown are covered without a real worker. Same capture-and-invoke pattern as
// the authz tests: a fake socket records each `.on(event, cb)`, and we invoke the
// captured callbacks with fake router/transport/producer/consumer objects whose
// methods are spied. Assertions target external effects — acks, emits, and
// mediasoup method calls — never internal variables.

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
import {
  getOrCreateRoom, getRoom, getPeer, addPeer, removePeer, closeRoomIfEmpty,
} from '../src/sfu/sfu-rooms.js';

const ROOM = 'room-1';

function makeFakes() {
  const producer = { id: 'prod-1', kind: 'video', paused: false, appData: {}, on: vi.fn(), close: vi.fn() };
  const consumer = {
    id: 'cons-1', kind: 'video', rtpParameters: { c: 1 }, producerPaused: false,
    on: vi.fn(), resume: vi.fn().mockResolvedValue(undefined), setPriority: vi.fn().mockResolvedValue(undefined),
  };
  const transport = {
    id: 'trans-1', iceParameters: { i: 1 }, iceCandidates: [{ c: 1 }], dtlsParameters: { d: 1 },
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    produce: vi.fn().mockResolvedValue(producer),
    consume: vi.fn().mockResolvedValue(consumer),
    close: vi.fn(),
  };
  const router = {
    rtpCapabilities: { codecs: ['opus', 'vp8'] },
    createWebRtcTransport: vi.fn().mockResolvedValue(transport),
    canConsume: vi.fn().mockReturnValue(true),
  };
  const peer = { transports: new Map(), producers: new Map(), consumers: new Map(), handRaised: false };
  const room = { router, audioLevelObserver: {}, audioProducerToSocket: new Map(), peers: new Map() };
  return { producer, consumer, transport, router, peer, room };
}

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

// Seed the module's socketRoom map for the caller via the real entry handler.
async function joinRoom(handlers, room) {
  getOrCreateRoom.mockResolvedValue(room);
  await handlers['sfu-get-rtp-capabilities']({ roomId: ROOM }, vi.fn());
}

const emitted = (emits, event) => emits.find((e) => e.event === event);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SFU lifecycle handlers', () => {
  describe('sfu-get-rtp-capabilities', () => {
    it('registers the peer and acks the router RTP capabilities', async () => {
      const { handlers, socket } = setup();
      const { room } = makeFakes();
      getOrCreateRoom.mockResolvedValue(room);
      const cb = vi.fn();

      await handlers['sfu-get-rtp-capabilities']({ roomId: ROOM }, cb);

      expect(addPeer).toHaveBeenCalledWith(ROOM, socket.id, socket.user);
      expect(socket.join).toHaveBeenCalledWith(ROOM);
      expect(cb).toHaveBeenCalledWith({ rtpCapabilities: room.router.rtpCapabilities });
    });

    it('acks an error when roomId is missing', async () => {
      const { handlers } = setup();
      const cb = vi.fn();

      await handlers['sfu-get-rtp-capabilities']({}, cb);

      expect(cb).toHaveBeenCalledWith({ error: 'roomId required' });
    });
  });

  describe('sfu-create-transport', () => {
    it('creates a WebRTC transport, stores it on the peer, and acks its params', async () => {
      const { handlers } = setup();
      const { room, peer, transport } = makeFakes();
      await joinRoom(handlers, room);
      getRoom.mockReturnValue(room);
      getPeer.mockReturnValue(peer);
      const cb = vi.fn();

      await handlers['sfu-create-transport']({ direction: 'send' }, cb);

      expect(room.router.createWebRtcTransport).toHaveBeenCalledTimes(1);
      expect(peer.transports.get(transport.id)).toBe(transport);
      expect(cb).toHaveBeenCalledWith({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    });

    it('acks an error for an invalid direction', async () => {
      const { handlers } = setup();
      const { room, peer } = makeFakes();
      await joinRoom(handlers, room);
      getRoom.mockReturnValue(room);
      getPeer.mockReturnValue(peer);
      const cb = vi.fn();

      await handlers['sfu-create-transport']({ direction: 'sideways' }, cb);

      expect(cb).toHaveBeenCalledWith({ error: 'bad direction' });
      expect(room.router.createWebRtcTransport).not.toHaveBeenCalled();
    });
  });

  describe('sfu-produce', () => {
    it('creates a producer, acks its id, and notifies other peers', async () => {
      const { handlers, socketEmits } = setup();
      const { room, peer, transport, producer } = makeFakes();
      peer.transports.set(transport.id, transport);
      await joinRoom(handlers, room);
      getRoom.mockReturnValue(room);
      getPeer.mockReturnValue(peer);
      const cb = vi.fn();

      await handlers['sfu-produce'](
        { transportId: transport.id, kind: 'video', rtpParameters: {}, appData: {} },
        cb,
      );

      expect(transport.produce).toHaveBeenCalledTimes(1);
      expect(peer.producers.get(producer.id)).toBe(producer);
      const evt = emitted(socketEmits, 'sfu-new-producer');
      expect(evt?.target).toBe(ROOM);
      expect(evt?.payload).toMatchObject({ producerId: producer.id, socketId: 'caller-sock', kind: 'video' });
      expect(cb).toHaveBeenCalledWith({ id: producer.id });
    });

    it('acks an error when the send transport is missing', async () => {
      const { handlers } = setup();
      const { room, peer } = makeFakes();
      await joinRoom(handlers, room);
      getRoom.mockReturnValue(room);
      getPeer.mockReturnValue(peer);
      const cb = vi.fn();

      await handlers['sfu-produce']({ transportId: 'missing', kind: 'video', rtpParameters: {} }, cb);

      expect(cb).toHaveBeenCalledWith({ error: 'send transport not found' });
    });
  });

  describe('sfu-consume', () => {
    it('creates a consumer and acks its params when canConsume is true', async () => {
      const { handlers } = setup();
      const { room, peer, transport, consumer } = makeFakes();
      peer.transports.set(transport.id, transport);
      room.router.canConsume.mockReturnValue(true);
      await joinRoom(handlers, room);
      getRoom.mockReturnValue(room);
      getPeer.mockReturnValue(peer);
      const cb = vi.fn();

      await handlers['sfu-consume']({ transportId: transport.id, producerId: 'prod-x', rtpCapabilities: {} }, cb);

      expect(transport.consume).toHaveBeenCalledTimes(1);
      expect(peer.consumers.get(consumer.id)).toBe(consumer);
      expect(cb).toHaveBeenCalledWith({
        id: consumer.id,
        producerId: 'prod-x',
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        producerPaused: consumer.producerPaused,
      });
    });

    it('does not consume and acks an error when canConsume is false', async () => {
      const { handlers } = setup();
      const { room, peer, transport } = makeFakes();
      peer.transports.set(transport.id, transport);
      room.router.canConsume.mockReturnValue(false);
      await joinRoom(handlers, room);
      getRoom.mockReturnValue(room);
      getPeer.mockReturnValue(peer);
      const cb = vi.fn();

      await handlers['sfu-consume']({ transportId: transport.id, producerId: 'prod-x', rtpCapabilities: {} }, cb);

      expect(transport.consume).not.toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ error: 'cannot consume this producer' });
    });
  });

  describe('sfu-close-producer', () => {
    it('closes the producer, removes it from the peer, and acks', async () => {
      const { handlers } = setup();
      const { room, peer, producer } = makeFakes();
      peer.producers.set(producer.id, producer);
      await joinRoom(handlers, room);
      getPeer.mockReturnValue(peer);
      const cb = vi.fn();

      await handlers['sfu-close-producer']({ producerId: producer.id }, cb);

      expect(producer.close).toHaveBeenCalledTimes(1);
      expect(peer.producers.has(producer.id)).toBe(false);
      expect(cb).toHaveBeenCalledWith({ closed: true });
    });

    it('acks an error when the producer is unknown', async () => {
      const { handlers } = setup();
      const { room, peer } = makeFakes();
      await joinRoom(handlers, room);
      getPeer.mockReturnValue(peer);
      const cb = vi.fn();

      await handlers['sfu-close-producer']({ producerId: 'ghost' }, cb);

      expect(cb).toHaveBeenCalledWith({ error: 'producer not found' });
    });
  });

  describe('disconnect cleanup', () => {
    it('removes the peer, notifies the room, and frees the room if empty', async () => {
      const { handlers, socketEmits } = setup();
      const { room } = makeFakes();
      await joinRoom(handlers, room);

      handlers['disconnect']();

      expect(removePeer).toHaveBeenCalledWith(ROOM, 'caller-sock');
      const evt = emitted(socketEmits, 'sfu-peer-left');
      expect(evt?.target).toBe(ROOM);
      expect(evt?.payload).toEqual({ socketId: 'caller-sock' });
      expect(closeRoomIfEmpty).toHaveBeenCalledWith(ROOM);
    });

    it('is a no-op when the socket was never in a room', () => {
      // A distinct, never-joined socket id guarantees no socketRoom entry,
      // independent of other tests.
      const { handlers } = setup({ socketId: 'never-joined-sock' });

      handlers['disconnect']();

      expect(removePeer).not.toHaveBeenCalled();
      expect(closeRoomIfEmpty).not.toHaveBeenCalled();
    });
  });
});

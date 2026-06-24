// Pure unit tests for the in-memory SFU room store in server/src/sfu/sfu-rooms.js
// — add/remove peer, list other producers, and close-on-empty bookkeeping. No
// sockets, no DB, and no real mediasoup worker: the worker pool is mocked so
// getOrCreateRoom builds a fake router with a spied close(). The module keeps a
// module-level `rooms` Map, so each test uses a distinct roomId for isolation.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/sfu/workers.js', () => ({
  // Each createRouter call yields a fresh fake router with a spied close(),
  // reachable via the room object getOrCreateRoom returns.
  getWorker: vi.fn(() => ({ pid: 123, createRouter: vi.fn(async () => ({ close: vi.fn() })) })),
}));

import {
  getOrCreateRoom, getRoom, addPeer, getPeer, listOtherProducers, removePeer, closeRoomIfEmpty,
} from '../src/sfu/sfu-rooms.js';
import { getWorker } from '../src/sfu/workers.js';

// A fake mediasoup producer as stored on a peer (only the fields the store reads).
function fakeProducer(id, over = {}) {
  return { id, kind: 'audio', paused: false, appData: { source: 'mic' }, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sfu-rooms in-memory state', () => {
  describe('getOrCreateRoom', () => {
    it('creates a room with an empty peers map on first call', async () => {
      const room = await getOrCreateRoom('r-create-1');

      expect(room).toBeTruthy();
      expect(room.peers).toBeInstanceOf(Map);
      expect(room.peers.size).toBe(0);
      expect(getWorker).toHaveBeenCalledTimes(1);
    });

    it('returns the same cached room (no second router) on subsequent calls', async () => {
      const first = await getOrCreateRoom('r-create-2');
      const second = await getOrCreateRoom('r-create-2');

      expect(second).toBe(first);
      expect(getWorker).toHaveBeenCalledTimes(1); // router built once, then cached
    });
  });

  describe('addPeer / getPeer', () => {
    it('registers a peer with empty transport/producer/consumer maps', async () => {
      await getOrCreateRoom('r-add-1');
      const peer = addPeer('r-add-1', 's1', { id: 'u1', name: 'Ada' });

      expect(peer.socketId).toBe('s1');
      expect(peer.user).toEqual({ id: 'u1', name: 'Ada' });
      expect(peer.transports).toBeInstanceOf(Map);
      expect(peer.producers).toBeInstanceOf(Map);
      expect(peer.consumers).toBeInstanceOf(Map);
      expect(getPeer('r-add-1', 's1')).toBe(peer);
    });

    it('is idempotent — re-adding the same socket returns the existing peer', async () => {
      const room = await getOrCreateRoom('r-add-2');
      const first = addPeer('r-add-2', 's1', { id: 'u1' });
      const again = addPeer('r-add-2', 's1', { id: 'u1' });

      expect(again).toBe(first);
      expect(room.peers.size).toBe(1);
    });

    it('returns null when adding to a room that does not exist', () => {
      expect(addPeer('r-missing', 's1', { id: 'u1' })).toBeNull();
      expect(getPeer('r-missing', 's1')).toBeNull();
    });

    it('getPeer returns null for an unknown peer in an existing room', async () => {
      await getOrCreateRoom('r-add-3');
      expect(getPeer('r-add-3', 'nobody')).toBeNull();
    });
  });

  describe('listOtherProducers', () => {
    it('returns every producer except the requesting peer’s own', async () => {
      await getOrCreateRoom('r-list-1');
      const a = addPeer('r-list-1', 'sa', { id: 'ua' });
      const b = addPeer('r-list-1', 'sb', { id: 'ub' });
      a.producers.set('pa', fakeProducer('pa', { kind: 'audio' }));
      b.producers.set('pb', fakeProducer('pb', { kind: 'video', paused: true }));

      const forA = listOtherProducers('r-list-1', 'sa');

      expect(forA).toHaveLength(1);
      expect(forA[0]).toEqual({
        producerId: 'pb',
        socketId: 'sb',
        user: { id: 'ub' },
        kind: 'video',
        paused: true,
        appData: { source: 'mic' },
      });
    });

    it('returns an empty array for an unknown room', () => {
      expect(listOtherProducers('r-none', 'sx')).toEqual([]);
    });

    it('returns an empty array when the only peer is the requester', async () => {
      await getOrCreateRoom('r-list-2');
      const a = addPeer('r-list-2', 'sa', { id: 'ua' });
      a.producers.set('pa', fakeProducer('pa'));

      expect(listOtherProducers('r-list-2', 'sa')).toEqual([]);
    });
  });

  describe('removePeer', () => {
    it('deletes the peer and closes its transports', async () => {
      await getOrCreateRoom('r-remove-1');
      const peer = addPeer('r-remove-1', 's1', { id: 'u1' });
      const t1 = { close: vi.fn() };
      const t2 = { close: vi.fn() };
      peer.transports.set('t1', t1);
      peer.transports.set('t2', t2);

      removePeer('r-remove-1', 's1');

      expect(t1.close).toHaveBeenCalledTimes(1);
      expect(t2.close).toHaveBeenCalledTimes(1);
      expect(getPeer('r-remove-1', 's1')).toBeNull();
    });

    it('is a safe no-op for an unknown peer or unknown room', async () => {
      await getOrCreateRoom('r-remove-2');
      expect(() => removePeer('r-remove-2', 'ghost')).not.toThrow();
      expect(() => removePeer('r-room-never', 's1')).not.toThrow();
    });
  });

  describe('closeRoomIfEmpty', () => {
    it('does not close a room that still has peers', async () => {
      const room = await getOrCreateRoom('r-close-1');
      addPeer('r-close-1', 's1', { id: 'u1' });

      closeRoomIfEmpty('r-close-1');

      expect(room.router.close).not.toHaveBeenCalled();
      expect(getRoom('r-close-1')).toBe(room);
    });

    it('closes the router and drops the room once the last peer leaves', async () => {
      const room = await getOrCreateRoom('r-close-2');
      addPeer('r-close-2', 's1', { id: 'u1' });

      removePeer('r-close-2', 's1');
      closeRoomIfEmpty('r-close-2');

      expect(room.router.close).toHaveBeenCalledTimes(1);
      expect(getRoom('r-close-2')).toBeNull();
    });

    it('is a safe no-op for an unknown room', () => {
      expect(() => closeRoomIfEmpty('r-close-none')).not.toThrow();
    });
  });
});

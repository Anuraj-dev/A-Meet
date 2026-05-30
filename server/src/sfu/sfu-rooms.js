// Per-room mediasoup state (M4): one Router per room, and per-peer bookkeeping
// of its transports / producers / consumers so we can tear everything down on
// disconnect. Functional module (mirrors socket/room-manager.js), not a class.
//
// Lifecycle: a Router is created lazily on the first `sfu-get-rtp-capabilities`
// for a room and closed when the last peer leaves (closeRoomIfEmpty), freeing
// its Worker resources.

import { getWorker } from './workers.js';
import { mediaCodecs } from './config.js';

// roomId → { router, peers: Map<socketId, Peer> }
//   Peer = { socketId, user, transports, producers, consumers } (all Maps keyed by id)
const rooms = new Map();

// Lazily create the room's Router on a round-robin Worker.
export async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (room) return room;

  const worker = getWorker();
  const router = await worker.createRouter({ mediaCodecs });
  room = { router, peers: new Map() };
  rooms.set(roomId, room);
  console.log(`[sfu] room ${roomId}: router created on worker ${worker.pid}`);
  return room;
}

export function getRoom(roomId) {
  return rooms.get(roomId) ?? null;
}

export function addPeer(roomId, socketId, user) {
  const room = rooms.get(roomId);
  if (!room) return null;
  let peer = room.peers.get(socketId);
  if (peer) return peer; // idempotent (e.g. a re-sent rtp-capabilities request)
  peer = {
    socketId,
    user,
    handRaised: false,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  };
  room.peers.set(socketId, peer);
  return peer;
}

export function getPeer(roomId, socketId) {
  return rooms.get(roomId)?.peers.get(socketId) ?? null;
}

// Every producer currently in the room except `exceptSocketId`'s own — what a
// newcomer needs to consume on join (and what we hand back for `sfu-get-producers`).
export function listOtherProducers(roomId, exceptSocketId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  const result = [];
  for (const peer of room.peers.values()) {
    if (peer.socketId === exceptSocketId) continue;
    for (const producer of peer.producers.values()) {
      result.push({
        producerId: producer.id,
        socketId: peer.socketId,
        user: peer.user,
        kind: producer.kind,
        paused: producer.paused,
        appData: producer.appData,
      });
    }
  }
  return result;
}

// Close a peer's transports — mediasoup cascades this to close every Producer
// and Consumer that lived on them — then drop the peer from the room.
export function removePeer(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const peer = room.peers.get(socketId);
  if (!peer) return;
  for (const transport of peer.transports.values()) {
    try { transport.close(); } catch { /* already closed */ }
  }
  room.peers.delete(socketId);
}

// Free the Router (and its Worker resources) once the room empties out.
export function closeRoomIfEmpty(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.peers.size > 0) return;
  try { room.router.close(); } catch { /* already closed */ }
  rooms.delete(roomId);
  console.log(`[sfu] room ${roomId}: empty → router closed`);
}

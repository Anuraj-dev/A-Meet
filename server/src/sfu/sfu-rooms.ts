// Per-room mediasoup state (M4): one Router per room, and per-peer bookkeeping
// of its transports / producers / consumers so we can tear everything down on
// disconnect. Functional module (mirrors socket/room-manager.js), not a class.
//
// Lifecycle: a Router is created lazily on the first `sfu-get-rtp-capabilities`
// for a room and closed when the last peer leaves (closeRoomIfEmpty), freeing
// its Worker resources.

import type { types as MediasoupTypes } from 'mediasoup';
import { getWorker } from './workers.js';
import { mediaCodecs } from './config.js';
import { logger } from '../config/logger.js';
import type { AuthUser } from '../types.js';

// Per-peer mediasoup bookkeeping (all Maps keyed by the mediasoup object id).
export interface Peer {
  socketId: string;
  user: AuthUser;
  handRaised: boolean;
  transports: Map<string, MediasoupTypes.WebRtcTransport>;
  producers: Map<string, MediasoupTypes.Producer>;
  consumers: Map<string, MediasoupTypes.Consumer>;
}

export interface Room {
  router: MediasoupTypes.Router;
  peers: Map<string, Peer>;
  // Created lazily on first peer join (sfu-handlers); absent until then.
  audioLevelObserver?: MediasoupTypes.AudioLevelObserver;
  audioProducerToSocket?: Map<string, string>; // producerId → socketId
}

// roomId → Room
const rooms = new Map<string, Room>();

// Lazily create the room's Router on a round-robin Worker.
export async function getOrCreateRoom(roomId: string): Promise<Room> {
  let room = rooms.get(roomId);
  if (room) return room;

  const worker = getWorker();
  const router = await worker.createRouter({ mediaCodecs });
  room = { router, peers: new Map() };
  rooms.set(roomId, room);
  logger.info({ event: 'room.routerCreated', roomId, workerPid: worker.pid }, 'SFU router created');
  return room;
}

export function getRoom(roomId: string | undefined) {
  if (roomId == null) return null;
  return rooms.get(roomId) ?? null;
}

export function addPeer(roomId: string, socketId: string, user: AuthUser) {
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

export function getPeer(roomId: string | undefined, socketId: string) {
  if (roomId == null) return null;
  return rooms.get(roomId)?.peers.get(socketId) ?? null;
}

// Every producer currently in the room except `exceptSocketId`'s own — what a
// newcomer needs to consume on join (and what we hand back for `sfu-get-producers`).
export function listOtherProducers(roomId: string | undefined, exceptSocketId: string) {
  const room = roomId == null ? undefined : rooms.get(roomId);
  if (!room) return [];
  const result: Array<{
    producerId: string;
    socketId: string;
    user: AuthUser;
    kind: MediasoupTypes.MediaKind;
    paused: boolean;
    appData: MediasoupTypes.AppData;
  }> = [];
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
export function removePeer(roomId: string, socketId: string) {
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
export function closeRoomIfEmpty(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.peers.size > 0) return;
  try { room.router.close(); } catch { /* already closed */ }
  rooms.delete(roomId);
  logger.info({ event: 'room.routerClosed', roomId }, 'SFU router closed (room empty)');
}

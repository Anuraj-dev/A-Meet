// WebRTC signaling relay (M2). Kept fully separate from M1 chat/presence.
//
// The server is a dumb relay: it never touches media. It only (a) tells a
// newcomer who is already in the call so the newcomer can offer to them, and
// (b) forwards socket-addressed offer/answer/ICE messages between two peers.
//
// "Ready" is tracked at the socketId level (a logged-in user can have several
// tabs = several peers), independent of M1's userId-deduped room map.

import type { Server, Socket } from 'socket.io';

// roomId → Set<socketId> of peers ready to negotiate media
const readyRooms = new Map<string, Set<string>>();
// socketId → roomId  (reverse index for fast disconnect cleanup)
const socketReadyRoom = new Map<string, string>();

function addReady(roomId: string, socketId: string) {
  if (!readyRooms.has(roomId)) readyRooms.set(roomId, new Set());
  readyRooms.get(roomId)!.add(socketId);
  socketReadyRoom.set(socketId, roomId);
}

function removeReady(socketId: string) {
  const roomId = socketReadyRoom.get(socketId);
  if (!roomId) return null;
  const peers = readyRooms.get(roomId);
  peers?.delete(socketId);
  if (peers?.size === 0) readyRooms.delete(roomId);
  socketReadyRoom.delete(socketId);
  return { roomId };
}

export function registerWebrtcHandlers(io: Server, socket: Socket) {
  // Newcomer announces it has local media and is ready to negotiate.
  // We reply with the peers ALREADY ready (self excluded — we add after), and
  // the newcomer initiates an offer to each (newcomer-initiates → no glare).
  socket.on('webrtc-ready', (roomId) => {
    if (!roomId || typeof roomId !== 'string') return;
    const peers = [...(readyRooms.get(roomId) ?? [])];
    addReady(roomId, socket.id);
    socket.emit('webrtc-peers', peers);
  });

  // Pure relays — stamp the sender's socketId as `from` so the recipient can reply.
  socket.on('webrtc-offer', ({ to, description }) => {
    if (!to || !description) return;
    io.to(to).emit('webrtc-offer', { from: socket.id, description });
  });

  socket.on('webrtc-answer', ({ to, description }) => {
    if (!to || !description) return;
    io.to(to).emit('webrtc-answer', { from: socket.id, description });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    if (!to || !candidate) return;
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // Whether this peer's camera/mic is currently on, so others can show a
  // placeholder avatar / mic-off badge instead of a black/silent tile.
  // `to` set → targeted (sent to a freshly-connected peer); otherwise broadcast
  // the new state to the whole room. Identity is stamped from socket.user.
  socket.on('webrtc-media-state', ({ to, video, audio }) => {
    const payload = {
      socketId: socket.id,
      user: socket.user,
      video: !!video,
      audio: !!audio,
    };
    if (to) {
      io.to(to).emit('webrtc-media-state', payload);
    } else {
      const roomId = socketReadyRoom.get(socket.id);
      if (roomId) socket.to(roomId).emit('webrtc-media-state', payload);
    }
  });

  // socketId-level teardown so peers close the exact PC for this socket
  // (distinct from M1's deduped `user-left`, which fires per logged-in user).
  socket.on('disconnect', () => {
    const result = removeReady(socket.id);
    if (result) {
      socket.to(result.roomId).emit('webrtc-peer-left', { socketId: socket.id });
    }
  });
}

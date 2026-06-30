import type { AuthUser } from '../types.js';

// roomId → Map<socketId, AuthUser>
const rooms = new Map<string, Map<string, AuthUser>>();
// socketId → roomId  (reverse index for fast disconnect lookup)
const socketRoom = new Map<string, string>();

export function addUser(roomId: string, socketId: string, user: AuthUser) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  rooms.get(roomId)!.set(socketId, user);
  socketRoom.set(socketId, roomId);
}

export function removeUser(socketId: string) {
  const roomId = socketRoom.get(socketId);
  if (!roomId) return null;
  const room = rooms.get(roomId);
  const user = room?.get(socketId);
  if (!user) return null;
  room?.delete(socketId);
  if (room?.size === 0) rooms.delete(roomId);
  socketRoom.delete(socketId);
  return { roomId, user };
}

export function getRoomUsers(roomId: string) {
  // Deduplicate by user.id (one row per person even across multiple tabs),
  // keeping the user's MOST RECENT socket — so after a reconnect the roster
  // points at the live socket, not a stale one pending the leave grace window.
  // Each row carries that `socketId` so the client can target a specific socket
  // for host moderation (mute/remove/spotlight) even when the SFU media path —
  // the usual source of socket ids — is absent. First-seen user order is kept.
  const byUser = new Map<string, AuthUser & { socketId: string }>();
  for (const [socketId, user] of (rooms.get(roomId)?.entries() ?? [])) {
    byUser.set(user.id, { ...user, socketId });
  }
  return [...byUser.values()];
}

export function isUserInRoom(roomId: string, userId: string) {
  for (const user of (rooms.get(roomId)?.values() ?? [])) {
    if (user.id === userId) return true;
  }
  return false;
}

export function getUserRoom(socketId: string) {
  return socketRoom.get(socketId) ?? null;
}

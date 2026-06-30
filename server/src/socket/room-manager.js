// roomId → Map<socketId, { id, name, email, avatar }>
const rooms = new Map();
// socketId → roomId  (reverse index for fast disconnect lookup)
const socketRoom = new Map();

export function addUser(roomId, socketId, user) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  rooms.get(roomId).set(socketId, user);
  socketRoom.set(socketId, roomId);
}

export function removeUser(socketId) {
  const roomId = socketRoom.get(socketId);
  if (!roomId) return null;
  const room = rooms.get(roomId);
  const user = room?.get(socketId);
  room?.delete(socketId);
  if (room?.size === 0) rooms.delete(roomId);
  socketRoom.delete(socketId);
  return { roomId, user };
}

export function getRoomUsers(roomId) {
  // Deduplicate by user.id (one row per person even across multiple tabs),
  // keeping the user's MOST RECENT socket — so after a reconnect the roster
  // points at the live socket, not a stale one pending the leave grace window.
  // Each row carries that `socketId` so the client can target a specific socket
  // for host moderation (mute/remove/spotlight) even when the SFU media path —
  // the usual source of socket ids — is absent. First-seen user order is kept.
  const byUser = new Map();
  for (const [socketId, user] of (rooms.get(roomId)?.entries() ?? [])) {
    byUser.set(user.id, { ...user, socketId });
  }
  return [...byUser.values()];
}

export function isUserInRoom(roomId, userId) {
  for (const user of (rooms.get(roomId)?.values() ?? [])) {
    if (user.id === userId) return true;
  }
  return false;
}

export function getUserRoom(socketId) {
  return socketRoom.get(socketId) ?? null;
}

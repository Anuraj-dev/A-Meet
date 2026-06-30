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
  const seen = new Set();
  const result = [];
  // Deduplicate by user.id (one row per person even across multiple tabs),
  // keeping the first socket seen. Each row carries that `socketId` so the
  // client can target a specific socket for host moderation (mute/remove/
  // spotlight) even when the SFU media path — the usual source of socket ids —
  // is absent.
  for (const [socketId, user] of (rooms.get(roomId)?.entries() ?? [])) {
    if (!seen.has(user.id)) {
      seen.add(user.id);
      result.push({ ...user, socketId });
    }
  }
  return result;
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

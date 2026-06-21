// A meeting administrator is a durable room property, not a property of the
// current Socket.IO peer. `host` predates this field and remains as the
// compatibility fallback for rooms created before `admin` was introduced.

function idOf(value) {
  if (!value) return null;
  return String(value._id ?? value.id ?? value);
}

export function getRoomAdminId(room) {
  return idOf(room?.admin) ?? idOf(room?.host);
}

export function isRoomAdmin(room, userId) {
  const adminId = getRoomAdminId(room);
  return Boolean(adminId && userId && adminId === String(userId));
}

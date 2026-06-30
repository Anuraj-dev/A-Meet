// A meeting administrator is a durable room property, not a property of the
// current Socket.IO peer. `host` predates this field and remains as the
// compatibility fallback for rooms created before `admin` was introduced.

// `value` is intentionally untyped: it may be a Mongoose document, an ObjectId,
// a populated sub-doc, or a bare string id depending on the call site.
function idOf(value: any): string | null {
  if (!value) return null;
  return String(value._id ?? value.id ?? value);
}

export function getRoomAdminId(room: any): string | null {
  return idOf(room?.admin) ?? idOf(room?.host);
}

export function isRoomAdmin(room: any, userId: unknown) {
  const adminId = getRoomAdminId(room);
  return Boolean(adminId && userId && adminId === String(userId));
}

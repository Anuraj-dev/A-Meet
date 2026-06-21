import { describe, expect, it } from 'vitest';
import { getRoomAdminId, isRoomAdmin } from '../src/rooms/room-admin.js';

describe('room administrator identity', () => {
  it('uses the persisted admin flag for new rooms', () => {
    const room = { host: 'former-host', admin: 'creator-admin' };
    expect(getRoomAdminId(room)).toBe('creator-admin');
    expect(isRoomAdmin(room, 'creator-admin')).toBe(true);
    expect(isRoomAdmin(room, 'former-host')).toBe(false);
  });

  it('keeps legacy room creators authorized through the host fallback', () => {
    const legacyRoom = { host: { _id: 'creator-admin' }, admin: null };
    expect(getRoomAdminId(legacyRoom)).toBe('creator-admin');
    expect(isRoomAdmin(legacyRoom, 'creator-admin')).toBe(true);
  });
});

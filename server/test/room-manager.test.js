import { describe, it, expect } from 'vitest';
import {
  addUser,
  removeUser,
  getRoomUsers,
  isUserInRoom,
  getUserRoom,
} from '../src/socket/room-manager.js';

// room-manager holds module-level Maps, so each test uses unique room/socket IDs
// to stay isolated from the others (there is no reset export by design).
const user = (id, name) => ({ id, name, email: `${name}@x.io`, avatar: '' });

describe('room-manager', () => {
  it('adds a user and lists them in the room, tagged with their socketId', () => {
    addUser('room-add', 'sock-1', user('u1', 'Anuraj'));
    // The roster carries the socketId so host moderation (mute/remove/spotlight)
    // can target a specific socket even when the SFU media path is absent.
    expect(getRoomUsers('room-add')).toEqual([{ ...user('u1', 'Anuraj'), socketId: 'sock-1' }]);
    expect(getUserRoom('sock-1')).toBe('room-add');
  });

  it('deduplicates a user joined from two sockets (e.g. two tabs), keeping the first socket', () => {
    addUser('room-dup', 'sock-a', user('u2', 'Bob'));
    addUser('room-dup', 'sock-b', user('u2', 'Bob')); // same user.id, new socket
    const users = getRoomUsers('room-dup');
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe('u2');
    expect(users[0].socketId).toBe('sock-a');
  });

  it('reports membership via isUserInRoom', () => {
    addUser('room-member', 'sock-m', user('u3', 'Cara'));
    expect(isUserInRoom('room-member', 'u3')).toBe(true);
    expect(isUserInRoom('room-member', 'nobody')).toBe(false);
    expect(isUserInRoom('no-such-room', 'u3')).toBe(false);
  });

  it('removeUser returns the room + user and evicts them', () => {
    addUser('room-rm', 'sock-r', user('u4', 'Dave'));
    const result = removeUser('sock-r');
    expect(result).toEqual({ roomId: 'room-rm', user: user('u4', 'Dave') });
    expect(getUserRoom('sock-r')).toBeNull();
    expect(getRoomUsers('room-rm')).toEqual([]);
  });

  it('deletes the room once its last user leaves', () => {
    addUser('room-last', 'sock-x', user('u5', 'Eve'));
    addUser('room-last', 'sock-y', user('u6', 'Finn'));
    removeUser('sock-x');
    expect(getRoomUsers('room-last')).toHaveLength(1); // Finn still here
    removeUser('sock-y');
    expect(getRoomUsers('room-last')).toEqual([]); // room gone, empty list
  });

  it('removeUser returns null for an unknown socket', () => {
    expect(removeUser('ghost-socket')).toBeNull();
  });

  it('getUserRoom returns null for an unknown socket', () => {
    expect(getUserRoom('ghost-socket')).toBeNull();
  });
});

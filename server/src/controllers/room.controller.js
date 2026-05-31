import { customAlphabet } from 'nanoid';
import { Room } from '../models/Room.js';

// Generates a Google Meet-style code: xxx-xxxx-xxx (lowercase letters only).
const segment = customAlphabet('abcdefghijklmnopqrstuvwxyz', 1);
function generateRoomId() {
  const block = (n) => Array.from({ length: n }, () => segment()).join('');
  return `${block(3)}-${block(4)}-${block(3)}`;
}

// POST /api/rooms — create a new room (host = current user).
export async function createRoom(req, res, next) {
  try {
    // Retry a few times in the (very unlikely) event of a code collision.
    let room;
    for (let attempt = 0; attempt < 5 && !room; attempt++) {
      const roomId = generateRoomId();
      try {
        room = await Room.create({ roomId, host: req.user.id, participants: [] });
      } catch (err) {
        if (err.code === 11000) continue; // duplicate roomId, retry
        throw err;
      }
    }
    if (!room) return res.status(500).json({ error: 'Could not generate a unique room code' });
    res.status(201).json({ roomId: room.roomId });
  } catch (err) {
    next(err);
  }
}

// GET /api/rooms/:roomId — validate a room exists and is active.
export async function getRoom(req, res, next) {
  try {
    // Codes are generated lowercase; lowercase the lookup so an uppercase param
    // (mobile autocapitalize, manual URL edit) still matches.
    const roomId = String(req.params.roomId || '').toLowerCase();
    const room = await Room.findOne({ roomId })
      .populate('host', 'name avatar')
      .lean();
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (!room.active) {
      // Existed but the host ended it — distinct from a wrong code so the client
      // can show "this meeting has ended" instead of "check your code".
      return res.status(410).json({ error: 'Meeting has ended', ended: true });
    }
    res.json({
      roomId: room.roomId,
      host: room.host,
      active: room.active,
      createdAt: room.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

import { customAlphabet } from 'nanoid';
import type { Request, Response, NextFunction } from 'express';
import { Room } from '../models/Room.js';
import { User } from '../models/User.js';
import { isRoomAdmin } from '../rooms/room-admin.js';

// Generates a Google Meet-style code: xxx-xxxx-xxx (lowercase letters only).
const segment = customAlphabet('abcdefghijklmnopqrstuvwxyz', 1);
function generateRoomId() {
  const block = (n: number) => Array.from({ length: n }, () => segment()).join('');
  return `${block(3)}-${block(4)}-${block(3)}`;
}

// Creates a Room with a freshly minted unique code, retrying a few times in the
// (very unlikely) event of a collision. `fields` carries any extra data (host,
// scheduling metadata, …). Returns the created doc, or null if all retries lost.
async function createUniqueRoom(fields: Record<string, unknown>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomId = generateRoomId();
    try {
      return await Room.create({ roomId, participants: [], ...fields });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) continue; // duplicate roomId, retry
      throw err;
    }
  }
  return null;
}

// Shape a scheduled-meeting doc for the client (omit internals like participants).
// `room` is a Mongoose document or lean object, indexed dynamically.
function toMeetingDto(room: any) {
  return {
    roomId: room.roomId,
    title: room.title,
    description: room.description,
    scheduledFor: room.scheduledFor,
    createdAt: room.createdAt,
  };
}

// POST /api/rooms — create a new instant room (host = current user).
export async function createRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await createUniqueRoom({ host: req.user!.id, admin: req.user!.id });
    if (!room) return res.status(500).json({ error: 'Could not generate a unique room code' });
    res.status(201).json({ roomId: room.roomId });
  } catch (err) {
    next(err);
  }
}

// POST /api/rooms/scheduled — reserve a room for later (title + time + notes).
// The link is joinable any time; `scheduledFor` is display-only metadata.
export async function createScheduledRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, scheduledFor, description } = req.body;
    const room = await createUniqueRoom({
      host: req.user!.id,
      admin: req.user!.id,
      title,
      scheduledFor,
      description,
    });
    if (!room) return res.status(500).json({ error: 'Could not generate a unique room code' });
    res.status(201).json(toMeetingDto(room));
  } catch (err) {
    next(err);
  }
}

// GET /api/rooms/mine — the signed-in user's upcoming (not-yet-ended) scheduled
// meetings, soonest first.
export async function listMyMeetings(req: Request, res: Response, next: NextFunction) {
  try {
    const rooms = await Room.find({
      host: req.user!.id,
      scheduledFor: { $ne: null },
      active: true,
    })
      .sort({ scheduledFor: 1 })
      .lean();
    res.json({ meetings: rooms.map(toMeetingDto) });
  } catch (err) {
    next(err);
  }
}

// Loads a scheduled meeting and asserts the caller hosts it. Returns the doc, or
// sends the appropriate error response and returns null.
async function loadOwnedMeeting(req: Request, res: Response) {
  const roomId = String(req.params.roomId || '').toLowerCase();
  const room = await Room.findOne({ roomId });
  if (!room || !room.scheduledFor || !room.active) {
    res.status(404).json({ error: 'Meeting not found' });
    return null;
  }
  if (!isRoomAdmin(room, req.user!.id)) {
    res.status(403).json({ error: 'Only the host can change this meeting' });
    return null;
  }
  return room;
}

// PATCH /api/rooms/scheduled/:roomId — host edits title / time / description.
export async function updateScheduledRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await loadOwnedMeeting(req, res);
    if (!room) return undefined;
    const { title, scheduledFor, description } = req.body;
    if (title !== undefined) room.title = title;
    if (scheduledFor !== undefined) room.scheduledFor = scheduledFor;
    if (description !== undefined) room.description = description;
    await room.save();
    return res.json(toMeetingDto(room));
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/rooms/scheduled/:roomId — host cancels. Soft-cancel via active:false
// so a stale invite link lands on the "meeting has ended" screen (getRoom → 410).
export async function cancelScheduledRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await loadOwnedMeeting(req, res);
    if (!room) return undefined;
    room.active = false;
    await room.save();
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

// GET /api/rooms/:roomId — validate a room exists and is active.
export async function getRoom(req: Request, res: Response, next: NextFunction) {
  try {
    // Codes are generated lowercase; lowercase the lookup so an uppercase param
    // (mobile autocapitalize, manual URL edit) still matches.
    const roomId = String(req.params.roomId || '').toLowerCase();
    // Read the raw refs first (no populate) so the response always carries the
    // host/admin id, even when the referenced User profile is missing — e.g. a
    // deleted account, or auth that issues JWTs without persisting a User doc.
    const room = await Room.findOne({ roomId }).lean();
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (!room.active) {
      // Existed but the host ended it — distinct from a wrong code so the client
      // can show "this meeting has ended" instead of "check your code".
      return res.status(410).json({ error: 'Meeting has ended', ended: true });
    }
    // Persist the explicit admin flag as legacy rooms are next accessed. The
    // response still uses the fallback immediately, so a creator never loses
    // admin UI while the backfill happens.
    const hostId = room.host ?? null;
    const adminId = room.admin ?? room.host ?? null;
    if (!room.admin && room.host) {
      void Room.updateOne({ _id: room._id, admin: null }, { $set: { admin: room.host } }).catch(() => {});
    }
    // Best-effort profile lookup for display (name/avatar); the id stands alone
    // if the profile is gone. Build `{ _id, ...profile }` so the client can
    // always resolve identity (host-only UI) by id.
    const profileFor = async (id: any) => {
      if (!id) return null;
      const profile = await User.findById(id).select('name avatar').lean().catch(() => null);
      return { _id: String(id), ...(profile ?? {}) };
    };
    const [host, admin] = await Promise.all([profileFor(hostId), profileFor(adminId)]);
    res.json({
      roomId: room.roomId,
      host,
      admin,
      active: room.active,
      title: room.title,
      description: room.description,
      scheduledFor: room.scheduledFor,
      createdAt: room.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

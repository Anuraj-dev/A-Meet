import { addUser, removeUser, getRoomUsers, isUserInRoom, getUserRoom } from './room-manager.js';
import { registerWebrtcHandlers } from './webrtc.js';
import { registerSfuHandlers } from './sfu-handlers.js';
import { Room } from '../models/Room.js';
import { isRoomAdmin } from '../rooms/room-admin.js';
import {
  cancelTranscriptExpiry,
  getTranscriptSnapshot,
  scheduleTranscriptExpiry,
  startTranscript,
  stopTranscript,
} from './transcript-manager.js';
import {
  sendContributorAudio,
  startContributor,
  stopContributor,
  stopRoomContributors,
  transcriptionConfigured,
} from '../transcription/meeting-transcription.js';
import { logger } from '../config/logger.js';

// A dropped connection (network blip, reload, server restart) makes Socket.IO
// reconnect with a brand-new socket: the old socket fires `disconnect` (→
// user-left) and a moment later the new one fires `join-room` (→ user-joined).
// Emitting both would spam every peer's chat log + join chime on a transient blip.
// So an *unexpected* disconnect DEFERS the leave by a short grace window keyed by
// roomId+userId; if the same user rejoins within it we cancel the leave and
// suppress the paired join, so peers see nothing.
//
// An *intentional* leave (the "Leave call" button) is different: the client emits
// `leave-room` first, so we remove them and notify peers immediately — no lag. The
// grace window is purely the fallback for drops the client couldn't announce
// (reload, tab close, crash, network loss). Multi-tab overlap is handled
// separately by isUserInRoom — only the user's last socket ever leaves.
const LEAVE_GRACE_MS = 4000;
const pendingLeaves = new Map(); // `${roomId}::${userId}` → timeout handle
const leaveKey = (roomId, userId) => `${roomId}::${userId}`;

export function registerHandlers(io) {
  io.on('connection', (socket) => {
    logger.debug({ event: 'socket.connected', socketId: socket.id, userId: socket.user?.id }, 'socket connected');

    // Mesh relay (M2/M3) stays registered for reference but is dormant — the
    // client now drives the SFU path (M4) instead.
    registerWebrtcHandlers(io, socket);
    registerSfuHandlers(io, socket);

    socket.on('join-room', (roomId) => {
      if (!roomId || typeof roomId !== 'string') return;

      // Cancel any pending leave for this user — a reconnect within the grace
      // window means they never really left, so neither leave nor join is sent.
      const key = leaveKey(roomId, socket.user.id);
      const rejoinedInGrace = pendingLeaves.has(key);
      if (rejoinedInGrace) {
        clearTimeout(pendingLeaves.get(key));
        pendingLeaves.delete(key);
      }

      const alreadyPresent = isUserInRoom(roomId, socket.user.id);
      socket.join(roomId);
      addUser(roomId, socket.id, socket.user);
      cancelTranscriptExpiry(roomId);

      logger.info({ event: 'room.joined', roomId, socketId: socket.id, userId: socket.user?.id }, 'user joined room');

      socket.emit('room-users', getRoomUsers(roomId));
      socket.emit('transcript-snapshot', {
        ...getTranscriptSnapshot(roomId),
        configured: transcriptionConfigured(),
      });
      if (!alreadyPresent && !rejoinedInGrace) {
        // Tag the join with the socketId so peers can target this socket for host
        // moderation even with the SFU media path off (matches getRoomUsers).
        socket.to(roomId).emit('user-joined', { ...socket.user, socketId: socket.id });
      } else if (rejoinedInGrace) {
        // A grace-window reconnect gets a FRESH socket id, but user-joined is
        // suppressed (no "rejoined" spam). Push peers an updated roster so their
        // moderation targets follow the live socket — otherwise a host removing a
        // just-reconnected peer would target the dropped socket (and the
        // same-room guard would reject it).
        socket.to(roomId).emit('room-users', getRoomUsers(roomId));
      }
    });

    socket.on('leave-room', () => {
      // Intentional leave: the "Leave call" button emits this just before
      // disconnecting, so we drop the socket and tell peers right away — no grace
      // window. The `disconnect` that follows no-ops (already removed).
      const result = removeUser(socket.id);
      if (!result) return;
      const { roomId, user } = result;
      const key = leaveKey(roomId, user.id);
      clearTimeout(pendingLeaves.get(key));
      pendingLeaves.delete(key);
      socket.leave(roomId);
      logger.info({ event: 'room.left', roomId, socketId: socket.id, userId: user?.id }, 'user left room');
      if (!isUserInRoom(roomId, user.id)) {
        socket.to(roomId).emit('user-left', user);
      }
      void stopContributor(socket.id);
      if (getRoomUsers(roomId).length === 0) scheduleTranscriptExpiry(roomId);
    });

    socket.on('chat-message', ({ roomId, text }) => {
      if (!roomId || !text || typeof text !== 'string') return;
      const trimmed = text.trim().slice(0, 1000);
      if (!trimmed) return;

      io.to(roomId).emit('chat-message', {
        sender: socket.user,
        text: trimmed,
        ts: Date.now(),
      });
    });

    // Shared transcription is host-controlled and server-authoritative. Clients
    // recognize only their own microphone; the server supplies identity, ordering
    // and timestamps, then broadcasts one canonical transcript to the room.
    socket.on('transcript-start', async (_payload, callback) => {
      const roomId = getUserRoom(socket.id);
      if (!roomId) return callback?.({ error: 'Not in a room' });
      if (!transcriptionConfigured()) return callback?.({ error: 'Transcription providers are not configured' });
      try {
        const room = await Room.findOne({ roomId }).select('host admin').lean();
        if (!isRoomAdmin(room, socket.user.id)) {
          return callback?.({ error: 'Only the meeting admin can start the transcript' });
        }
        const state = startTranscript(roomId, socket.user);
        io.to(roomId).emit('transcript-state', state);
        logger.info({ event: 'transcript.started', roomId, userId: socket.user.id }, 'shared transcript started');
        return callback?.({ ok: true, state });
      } catch (err) {
        return callback?.({ error: err.message });
      }
    });

    socket.on('transcript-stop', async (_payload, callback) => {
      const roomId = getUserRoom(socket.id);
      if (!roomId) return callback?.({ error: 'Not in a room' });
      try {
        const room = await Room.findOne({ roomId }).select('host admin').lean();
        if (!isRoomAdmin(room, socket.user.id)) {
          return callback?.({ error: 'Only the meeting admin can stop the transcript' });
        }
        await stopRoomContributors(roomId);
        const state = stopTranscript(roomId);
        io.to(roomId).emit('transcript-state', state);
        logger.info({ event: 'transcript.stopped', roomId, userId: socket.user.id }, 'shared transcript stopped');
        return callback?.({ ok: true, state });
      } catch (err) {
        return callback?.({ error: err.message });
      }
    });

    socket.on('transcript-contributor-start', async (_payload, callback) => {
      const roomId = getUserRoom(socket.id);
      if (!roomId) return callback?.({ error: 'Not in a room' });
      if (!getTranscriptSnapshot(roomId).active) return callback?.({ error: 'Transcript is not active' });
      try {
        await startContributor({ io, socket, roomId });
        return callback?.({ ok: true });
      } catch (error) {
        logger.warn({ event: 'transcript.contributorFailed', roomId, userId: socket.user.id, err: error.message }, 'could not start transcription contributor');
        return callback?.({ error: 'Could not connect to the transcription provider' });
      }
    });

    socket.on('transcript-audio', (audio) => {
      if (!audio || !sendContributorAudio(socket.id, audio)) return;
    });

    socket.on('transcript-contributor-stop', () => {
      void stopContributor(socket.id);
    });

    socket.on('disconnect', () => {
      void stopContributor(socket.id);
      logger.debug({ event: 'socket.disconnected', socketId: socket.id, userId: socket.user?.id }, 'socket disconnected');
      const result = removeUser(socket.id);
      if (!result) return;
      const { roomId, user } = result;
      // Another socket for the same user (a second tab) is still here — nothing left.
      if (isUserInRoom(roomId, user.id)) return;

      // Defer the leave: if the user reconnects within the grace window, join-room
      // cancels this timer. Re-check presence when it fires (they may be back on a
      // socket that, defensively, didn't clear the timer). io.to() rather than
      // socket.to() since this socket is already gone.
      const key = leaveKey(roomId, user.id);
      clearTimeout(pendingLeaves.get(key));
      pendingLeaves.set(key, setTimeout(() => {
        pendingLeaves.delete(key);
        if (!isUserInRoom(roomId, user.id)) {
          io.to(roomId).emit('user-left', user);
        }
        if (getRoomUsers(roomId).length === 0) scheduleTranscriptExpiry(roomId);
      }, LEAVE_GRACE_MS));
    });
  });
}

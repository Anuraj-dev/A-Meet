import { addUser, removeUser, getRoomUsers, isUserInRoom } from './room-manager.js';
import { registerWebrtcHandlers } from './webrtc.js';
import { registerSfuHandlers } from './sfu-handlers.js';
import { logger } from '../config/logger.js';

// A dropped connection (network blip, server restart) makes Socket.IO reconnect
// with a brand-new socket: the old socket fires `disconnect` (→ user-left) and a
// moment later the new one fires `join-room` (→ user-joined). Emitting both would
// spam every peer's chat log + join chime on a transient blip. So we DEFER the
// leave by a short grace window keyed by roomId+userId; if the same user rejoins
// within it we cancel the leave and suppress the paired join, so peers see
// nothing. A real departure just waits out the window (a few seconds' lag before
// peers see "left", same as Meet). Multi-tab overlap is handled separately by
// isUserInRoom — only the user's last socket ever schedules a leave.
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

      logger.info({ event: 'room.joined', roomId, socketId: socket.id, userId: socket.user?.id }, 'user joined room');

      socket.emit('room-users', getRoomUsers(roomId));
      if (!alreadyPresent && !rejoinedInGrace) {
        socket.to(roomId).emit('user-joined', socket.user);
      }
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

    socket.on('disconnect', () => {
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
      }, LEAVE_GRACE_MS));
    });
  });
}

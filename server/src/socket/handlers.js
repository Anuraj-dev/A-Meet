import { addUser, removeUser, getRoomUsers, isUserInRoom } from './room-manager.js';
import { registerWebrtcHandlers } from './webrtc.js';
import { registerSfuHandlers } from './sfu-handlers.js';
import { logger } from '../config/logger.js';

export function registerHandlers(io) {
  io.on('connection', (socket) => {
    logger.debug({ event: 'socket.connected', socketId: socket.id, userId: socket.user?.id }, 'socket connected');

    // Mesh relay (M2/M3) stays registered for reference but is dormant — the
    // client now drives the SFU path (M4) instead.
    registerWebrtcHandlers(io, socket);
    registerSfuHandlers(io, socket);

    socket.on('join-room', (roomId) => {
      if (!roomId || typeof roomId !== 'string') return;

      const alreadyPresent = isUserInRoom(roomId, socket.user.id);
      socket.join(roomId);
      addUser(roomId, socket.id, socket.user);

      logger.info({ event: 'room.joined', roomId, socketId: socket.id, userId: socket.user?.id }, 'user joined room');

      socket.emit('room-users', getRoomUsers(roomId));
      if (!alreadyPresent) {
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
      if (result) {
        const { roomId, user } = result;
        if (!isUserInRoom(roomId, user.id)) {
          socket.to(roomId).emit('user-left', user);
        }
      }
    });
  });
}

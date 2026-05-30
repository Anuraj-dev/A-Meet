import { addUser, removeUser, getRoomUsers, isUserInRoom } from './room-manager.js';

export function registerHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
      if (!roomId || typeof roomId !== 'string') return;

      const alreadyPresent = isUserInRoom(roomId, socket.user.id);
      socket.join(roomId);
      addUser(roomId, socket.id, socket.user);

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

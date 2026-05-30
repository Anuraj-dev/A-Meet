import { Server } from 'socket.io';
import { env } from '../config/env.js';

let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });
  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

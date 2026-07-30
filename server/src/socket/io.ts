import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from '../config/env.js';

let io: Server | undefined;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
    // Chat rejects serialized payloads above 64 KiB; PCM audio chunks and SFU
    // signaling packets stay far below this 128 KiB transport ingress bound.
    maxHttpBufferSize: 128 * 1024,
  });
  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

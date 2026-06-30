import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@a-meet/contracts';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const socket = io(import.meta.env.VITE_SERVER_URL, {
  withCredentials: true,
  autoConnect: false,
}) as AppSocket;

export default socket;

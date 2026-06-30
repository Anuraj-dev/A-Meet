import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@a-meet/contracts';

const socket = io(import.meta.env.VITE_SERVER_URL, {
  withCredentials: true,
  autoConnect: false,
}) as Socket<ServerToClientEvents, ClientToServerEvents>;

export default socket;

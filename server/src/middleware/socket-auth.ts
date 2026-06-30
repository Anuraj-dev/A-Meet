import { parse } from 'cookie';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { env } from '../config/env.js';
import { COOKIE_NAME } from './auth.js';
import type { AuthTokenPayload } from '../types.js';

export function socketAuth(socket: Socket, next: (err?: Error) => void) {
  const cookieHeader = socket.handshake.headers.cookie ?? '';
  const cookies = parse(cookieHeader);
  const token = cookies[COOKIE_NAME];

  if (!token) return next(new Error('unauthorized'));

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
    socket.user = { id: payload.sub ?? '', name: payload.name ?? '', email: payload.email ?? '', avatar: payload.avatar ?? '' };
    return next();
  } catch {
    return next(new Error('unauthorized'));
  }
}

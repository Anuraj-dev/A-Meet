// Shared server-side types + ambient augmentations.
//
// `AuthUser` is the authenticated identity carried on both the HTTP request
// (set by `requireAuth`) and the Socket.io socket (set by `socketAuth`). The
// `declare global` / `declare module` blocks below merge it onto Express'
// `Request` and Socket.io's `Socket` so handlers can read `req.user` /
// `socket.user` with full typing.
import type { JwtPayload } from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

/** Shape of the JWT we sign/verify for the auth cookie. */
export interface AuthTokenPayload extends JwtPayload {
  name?: string;
  email?: string;
  avatar?: string;
}

declare global {
  // Passport already declares `Request.user?: Express.User`; we widen the empty
  // `Express.User` to our `AuthUser` so `req.user` is typed without conflicting.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends AuthUser {}
  }
}

declare module 'socket.io' {
  interface Socket {
    // Non-optional: `socketAuth` (registered via io.use) sets this before any
    // connection handler runs and rejects the socket otherwise, so every socket
    // reaching a handler is authenticated.
    user: AuthUser;
  }
}

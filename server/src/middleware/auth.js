import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const COOKIE_NAME = 'ameet_token';

// Reads the JWT from the httpOnly cookie, verifies it, attaches req.user.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub, name: payload.name, email: payload.email, avatar: payload.avatar };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Signs a JWT for a given user document.
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, avatar: user.avatar },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

// Shared cookie options for setting/clearing the auth cookie.
// In production the React app (Vercel) and API (EC2) are on different origins,
// so we need sameSite:'none' + secure:true so the browser sends the cookie on
// cross-site fetch requests. In dev sameSite:'lax' is fine (both localhost).
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

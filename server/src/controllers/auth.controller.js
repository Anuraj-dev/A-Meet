import { env } from '../config/env.js';
import { COOKIE_NAME, signToken, cookieOptions } from '../middleware/auth.js';

// Called after Passport's Google callback succeeds (req.user is set by Passport).
// Mints a JWT, drops it in an httpOnly cookie, and redirects back to the client.
export function googleCallback(req, res) {
  const token = signToken(req.user);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.redirect(env.clientUrl);
}

// Returns the currently authenticated user (requireAuth populated req.user).
export function getMe(req, res) {
  res.json({ user: req.user });
}

// Clears the auth cookie.
export function logout(req, res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
}

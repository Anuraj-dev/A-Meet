import { env } from '../config/env.js';
import { COOKIE_NAME, signToken, cookieOptions } from '../middleware/auth.js';

// Only accept a same-origin relative path (a single leading slash, then a
// non-slash/backslash char) as the post-login destination. This blocks
// open-redirect payloads — "//evil.com", "/\evil.com", "https://evil.com" —
// from riding in on the OAuth `state` param.
function safeReturnPath(state) {
  if (typeof state !== 'string' || !/^\/[^/\\]/.test(state)) return '';
  return state;
}

// Called after Passport's Google callback succeeds (req.user is set by Passport).
// Mints a JWT, drops it in an httpOnly cookie, and redirects back to the client —
// to the meeting link the user originally opened (carried in `state`) when present.
export function googleCallback(req, res) {
  const token = signToken(req.user);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.redirect(env.clientUrl + safeReturnPath(req.query.state));
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

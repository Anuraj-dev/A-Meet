// Auth-stub helper: skips the real Google OAuth flow by minting the same JWT
// the server would issue and dropping it into a browser context as the auth
// cookie. Scenario authors call `stubAuth(context)` before navigating so the
// app's `/api/auth/me` check sees an authenticated user.
import jwt from 'jsonwebtoken';
import { TEST_JWT_SECRET, AUTH_COOKIE, DEFAULT_USER } from './constants.js';

// Mirrors server/src/middleware/auth.js signToken() — same claims, same secret.
export function makeToken(user = DEFAULT_USER) {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, avatar: user.avatar },
    TEST_JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// Adds the auth cookie to a Playwright BrowserContext. Scoped to the `localhost`
// domain so it is sent to the API regardless of port (client and server share
// the localhost site, so the cookie rides cross-port same-site requests).
export async function stubAuth(context, user = DEFAULT_USER) {
  await context.addCookies([
    {
      name: AUTH_COOKIE,
      value: makeToken(user),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  return user;
}

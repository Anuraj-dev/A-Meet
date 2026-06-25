// Shared constants for the E2E harness. Imported by both the server launcher
// (which signs/verifies JWTs with this secret) and the auth-stub helper (which
// mints cookies), so the two always agree.

export const SERVER_PORT = 5050;
export const CLIENT_PORT = 4173;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
export const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;

// Deterministic secret used only by the E2E server + auth stub. Never a real
// secret — the harness runs against a throwaway in-memory database.
export const TEST_JWT_SECRET = 'e2e-playwright-test-secret';

// Must match the cookie set by the server (server/src/middleware/auth.js).
export const AUTH_COOKIE = 'ameet_token';

// Default identity for stubbed sign-in. A 24-hex string so it is a valid
// Mongo ObjectId shape if a scenario later persists against it.
export const DEFAULT_USER = {
  id: '0123456789abcdef01234567',
  name: 'E2E Tester',
  email: 'e2e@example.com',
  avatar: '',
};

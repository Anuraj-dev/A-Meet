// Shared constants for the E2E harness. Imported by both the server launcher
// (which signs/verifies JWTs with this secret) and the auth-stub helper (which
// mints cookies), so the two always agree.

export const SERVER_PORT = 5050;
export const CLIENT_PORT = 4173;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
export const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;

// The SFU-enabled harness (#133) runs on its own ports so it never collides
// with the default SFU-off harness — a dev can run both back-to-back and
// `reuseExistingServer` won't hand an SFU-off server to an SFU-on spec.
export const SFU_SERVER_PORT = 5051;
export const SFU_CLIENT_PORT = 4174;
export const SFU_SERVER_URL = `http://localhost:${SFU_SERVER_PORT}`;
export const SFU_CLIENT_URL = `http://localhost:${SFU_CLIENT_PORT}`;
// Loopback media: mediasoup binds 0.0.0.0 and advertises 127.0.0.1, so both
// browser contexts (same host) reach it. A small RTC port band keeps the
// firewall surface tiny — two peers need only a handful of ports.
export const SFU_ANNOUNCED_IP = '127.0.0.1';
export const SFU_RTC_MIN_PORT = 40000;
export const SFU_RTC_MAX_PORT = 40100;

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

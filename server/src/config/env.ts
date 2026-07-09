import dotenv from 'dotenv';

dotenv.config();

// Env-int helper: parse a numeric env var, falling back to the baked-in default
// when unset, empty, or non-numeric (Number('') === 0, so `|| fallback` covers
// unset/empty; a NaN from garbage also falls back).
const num = (key: string, fallback: number): number => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const required = ['MONGO_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[env] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  serverUrl: process.env.SERVER_URL || 'http://localhost:5000',
  // Non-null: the `required` guard above exits the process if either is unset.
  mongoUri: process.env.MONGO_URI!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Boot the HTTP/auth/socket server WITHOUT the mediasoup SFU. Used by the E2E
  // harness so a landing/auth smoke test can run without compiling the native
  // mediasoup worker binary. Never set in production.
  sfuDisabled: process.env.SFU_DISABLED === '1',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
  mediasoup: {
    // IP the WebRtcTransport advertises to clients. 127.0.0.1 works for
    // same-machine multi-tab; LAN/prod needs the host's real/public IP.
    announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
    minPort: Number(process.env.MEDIASOUP_MIN_PORT) || 40000,
    maxPort: Number(process.env.MEDIASOUP_MAX_PORT) || 40100,
    // Empty → one worker per CPU core (decided in workers.js).
    numWorkers: Number(process.env.MEDIASOUP_NUM_WORKERS) || 0,
  },
  // Rate limiting. Defaults are deliberately generous — a legitimate meeting
  // participant never hits them; they only bite scripted abuse. Documented in
  // docs/conventions.md. HTTP: per-IP fixed windows (express-rate-limit,
  // in-memory). Socket: per-connection token buckets (capacity = burst,
  // refillPerSec = sustained rate).
  rateLimit: {
    http: {
      auth: {
        windowMs: num('RATE_LIMIT_AUTH_WINDOW_MS', 60_000),
        max: num('RATE_LIMIT_AUTH_MAX', 60),
      },
      room: {
        windowMs: num('RATE_LIMIT_ROOM_WINDOW_MS', 60_000),
        max: num('RATE_LIMIT_ROOM_MAX', 100),
      },
    },
    socket: {
      signaling: {
        capacity: num('RATE_LIMIT_SOCKET_SIGNALING_CAPACITY', 300),
        refillPerSec: num('RATE_LIMIT_SOCKET_SIGNALING_REFILL', 100),
      },
      chat: {
        capacity: num('RATE_LIMIT_SOCKET_CHAT_CAPACITY', 20),
        refillPerSec: num('RATE_LIMIT_SOCKET_CHAT_REFILL', 5),
      },
      // Consecutive denials by one actor before the offending socket is
      // force-disconnected — only sustained egregious flooding, never an
      // occasional over-limit blip.
      floodDisconnectThreshold: num('RATE_LIMIT_SOCKET_FLOOD_DISCONNECT', 100),
    },
  },
  transcription: {
    deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    deepgramModel: process.env.DEEPGRAM_TRANSCRIPTION_MODEL || 'nova-3',
    groqModel: process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3',
    mergeModel: process.env.GROQ_TRANSCRIPT_MERGE_MODEL || 'llama-3.3-70b-versatile',
  },
};

// Warn (don't crash) if Google OAuth isn't configured yet — lets the server
// boot for early development before credentials are pasted in.
if (!env.google.clientId || !env.google.clientSecret) {
  console.warn('[env] Google OAuth not configured yet (GOOGLE_CLIENT_ID/SECRET empty). Login will be disabled until set.');
}

if (!env.transcription.deepgramApiKey) {
  console.warn('[env] DEEPGRAM_API_KEY is missing. Shared transcription will be unavailable.');
}

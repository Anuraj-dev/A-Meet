import dotenv from 'dotenv';

dotenv.config();

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
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
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
};

// Warn (don't crash) if Google OAuth isn't configured yet — lets the server
// boot for early development before credentials are pasted in.
if (!env.google.clientId || !env.google.clientSecret) {
  console.warn('[env] Google OAuth not configured yet (GOOGLE_CLIENT_ID/SECRET empty). Login will be disabled until set.');
}

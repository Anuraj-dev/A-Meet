// Boots the real A-Meet server for E2E with the SFU **enabled** (#133), so the
// host-moderation cases that genuinely need media — enforced mute (pause a live
// mediasoup audio producer) and spotlight's visible layout effect (re-focus a
// remote tile) — can be asserted end-to-end. Mirrors server-launcher.js but
// without SFU_DISABLED, and points mediasoup at loopback so two browser
// contexts on this host can establish WebRTC without a TURN server.
//
// Requires the native mediasoup worker binary to be built (i.e. deps installed
// WITHOUT --ignore-scripts) — see the e2e-sfu CI job.
//
// Env is set HERE (before importing the server) because server/src/config/env.ts
// reads process.env at import time.
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  SFU_SERVER_PORT,
  SFU_CLIENT_URL,
  SFU_ANNOUNCED_IP,
  SFU_RTC_MIN_PORT,
  SFU_RTC_MAX_PORT,
  TEST_JWT_SECRET,
} from './helpers/constants.js';

const mongod = await MongoMemoryServer.create();

process.env.MONGO_URI = mongod.getUri();
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.PORT = String(SFU_SERVER_PORT);
process.env.CLIENT_URL = SFU_CLIENT_URL;
process.env.SERVER_URL = `http://localhost:${SFU_SERVER_PORT}`;
// Keep cookies usable over plain http://localhost (secure:false, sameSite:lax).
process.env.NODE_ENV = 'development';
// SFU ON: leave SFU_DISABLED unset so createWorkers() runs and the mediasoup
// router/transports come up. Advertise loopback so same-host browsers connect.
process.env.MEDIASOUP_ANNOUNCED_IP = SFU_ANNOUNCED_IP;
process.env.MEDIASOUP_MIN_PORT = String(SFU_RTC_MIN_PORT);
process.env.MEDIASOUP_MAX_PORT = String(SFU_RTC_MAX_PORT);

// Stop the in-memory mongod when Playwright tears the webServer down.
async function shutdown() {
  try {
    await mongod.stop();
  } finally {
    process.exit(0);
  }
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Importing the server module runs its self-invoking start(): connect Mongo,
// spin up mediasoup workers, create the HTTP/socket server, listen.
await import('../server/src/server.ts');

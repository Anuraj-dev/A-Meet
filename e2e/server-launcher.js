// Boots the real A-Meet server for E2E against a throwaway in-memory MongoDB,
// with the SFU disabled (SFU_DISABLED=1) so no native mediasoup binary is
// needed. Playwright starts this as one of its `webServer` processes.
//
// Env is set HERE (before importing the server) because server/src/config/env.ts
// reads process.env at import time. The in-memory mongod URI isn't known until
// runtime, so it can't live in a static .env.
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  SERVER_PORT,
  CLIENT_URL,
  TEST_JWT_SECRET,
} from './helpers/constants.js';

const mongod = await MongoMemoryServer.create();

process.env.MONGO_URI = mongod.getUri();
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.PORT = String(SERVER_PORT);
process.env.CLIENT_URL = CLIENT_URL;
process.env.SERVER_URL = `http://localhost:${SERVER_PORT}`;
// Keep cookies usable over plain http://localhost (secure:false, sameSite:lax).
process.env.NODE_ENV = 'development';
process.env.SFU_DISABLED = '1';

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
// (SFU skipped), create the HTTP/socket server, listen on SERVER_PORT.
await import('../server/src/server.ts');

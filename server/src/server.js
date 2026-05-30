import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

async function start() {
  try {
    await connectDB();
    const app = createApp();
    app.listen(env.port, () => {
      console.log(`[server] A-Meet API listening on ${env.serverUrl} (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();

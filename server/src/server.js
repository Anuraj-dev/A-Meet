import http from 'http';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './socket/io.js';
import { socketAuth } from './middleware/socket-auth.js';
import { registerHandlers } from './socket/handlers.js';

async function start() {
  try {
    await connectDB();
    const app = createApp();
    const httpServer = http.createServer(app);
    const io = initSocket(httpServer);

    io.use(socketAuth);
    registerHandlers(io);

    httpServer.listen(env.port, () => {
      console.log(`[server] A-Meet API listening on ${env.serverUrl} (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();

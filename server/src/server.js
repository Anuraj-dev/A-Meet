import http from 'http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './socket/io.js';
import { socketAuth } from './middleware/socket-auth.js';
import { registerHandlers } from './socket/handlers.js';
import { createWorkers } from './sfu/workers.js';
import { resolveAnnouncedIp } from './sfu/config.js';

async function start() {
  try {
    await connectDB();
    await createWorkers();
    // Resolve the IP mediasoup advertises to browsers before serving traffic —
    // on a private/loopback value this auto-detects the EC2 public IPv4, else
    // warns loudly (a wrong announced IP = peers can never connect media).
    await resolveAnnouncedIp();
    const app = createApp();
    const httpServer = http.createServer(app);
    const io = initSocket(httpServer);

    io.use(socketAuth);
    registerHandlers(io);

    httpServer.listen(env.port, () => {
      logger.info({ port: env.port, env: env.nodeEnv }, 'A-Meet API listening');
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

import http from 'http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './socket/io.js';
import { socketAuth } from './middleware/socket-auth.js';
import { registerHandlers } from './socket/handlers.js';
import { createWorkers, closeWorkers } from './sfu/workers.js';
import { resolveAnnouncedIp } from './sfu/config.js';
import { createLifecycle } from './lifecycle.js';

async function start() {
  try {
    await connectDB();
    // The SFU is skippable for E2E (SFU_DISABLED=1): it needs the native
    // mediasoup worker binary, which the landing/auth smoke test doesn't
    // exercise. Production always runs with the SFU on.
    if (!env.sfuDisabled) {
      await createWorkers();
      // Resolve the IP mediasoup advertises to browsers before serving traffic —
      // on a private/loopback value this auto-detects the EC2 public IPv4, else
      // warns loudly (a wrong announced IP = peers can never connect media).
      await resolveAnnouncedIp();
    } else {
      logger.warn('SFU_DISABLED=1 — starting without mediasoup workers (E2E mode)');
    }
    const app = createApp();
    const httpServer = http.createServer(app);
    const io = initSocket(httpServer);

    io.use(socketAuth);
    registerHandlers(io);

    // Crash-safe lifecycle: orderly drain on SIGTERM/SIGINT and fail-fast exit
    // on uncaught errors so a supervisor restarts us from a clean state.
    const lifecycle = createLifecycle({
      // Best-effort heads-up so clients can show "reconnecting" and back off.
      notifyRestart: () => io.emit('server-restarting'),
      // io.close() disconnects every socket; we drain the bare HTTP server after.
      closeSockets: () => new Promise((resolve) => io.close(() => resolve())),
      closeHttp: () => new Promise((resolve) => httpServer.close(() => resolve())),
      closeWorkers,
      closeDb: () => mongoose.disconnect(),
    });
    lifecycle.register();

    httpServer.listen(env.port, () => {
      logger.info({ port: env.port, env: env.nodeEnv }, 'A-Meet API listening');
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();

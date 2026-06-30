import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import passport from './config/passport.js';
import { areWorkersAlive } from './sfu/workers.js';
import authRoutes from './routes/auth.routes.js';
import roomRoutes from './routes/room.routes.js';
import logRoutes from './routes/log.routes.js';

const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const roomLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

export function createApp() {
  const app = express();

  // Behind nginx/the reverse proxy — trust 1 hop so express-rate-limit
  // reads the real client IP from X-Forwarded-For instead of erroring.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' || req.url.startsWith('/api/logs') } }));

  // Liveness — always 200 if the process is up. Must NOT touch dependencies, so
  // a transient Mongo/worker blip never makes an orchestrator kill a healthy
  // process. Readiness (below) is the dependency-aware gate.
  app.get('/api/health', (req, res) => res.json({ ok: true, env: env.nodeEnv }));

  // Readiness — 200 only when MongoDB is connected AND every mediasoup worker is
  // alive; otherwise 503 with the failing dependency so the deploy gate and the
  // EC2 auto-recovery alarm can act on a real signal. readyState === 1 means
  // 'connected' (0/2/3 are disconnected/connecting/disconnecting).
  app.get('/api/health/ready', (req, res) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ ok: false, reason: 'db' });
    }
    if (!areWorkersAlive()) {
      return res.status(503).json({ ok: false, reason: 'workers' });
    }
    return res.json({ ok: true });
  });
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/rooms', roomLimiter, roomRoutes);
  app.use('/api/logs', logRoutes);

  // 404
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Central error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, url: req.url, method: req.method }, err.message || 'Server error');
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });

  return app;
}

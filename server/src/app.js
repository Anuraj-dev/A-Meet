import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import passport from './config/passport.js';
import authRoutes from './routes/auth.routes.js';
import roomRoutes from './routes/room.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get('/api/health', (req, res) => res.json({ ok: true, env: env.nodeEnv }));
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);

  // 404
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Central error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });

  return app;
}

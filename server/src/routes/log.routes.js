import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { logger, addSseClient, removeSseClient } from '../config/logger.js';
import { env } from '../config/env.js';

const router = Router();

// Whitelist client-supplied levels — never index logger with arbitrary input
const ALLOWED_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

const clientLogLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/logs/client — receive batched frontend log entries
router.post('/client', clientLogLimiter, (req, res) => {
  const { logs } = req.body ?? {};
  if (!Array.isArray(logs)) return res.status(400).json({ error: 'logs array required' });
  for (const entry of logs.slice(0, 50)) {
    const { level = 'info', msg = '', ...rest } = entry;
    const fn = ALLOWED_LEVELS.has(level) ? logger[level] : logger.info;
    fn.call(logger, { src: 'client', ...rest }, msg);
  }
  res.json({ ok: true });
});

// GET /api/logs/stream — SSE real-time log tail (dev only)
router.get('/stream', (req, res) => {
  if (env.nodeEnv === 'production') return res.status(403).json({ error: 'dev only' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ msg: 'log stream connected', ts: new Date().toISOString() })}\n\n`);
  addSseClient(res);
  req.on('close', () => removeSseClient(res));
});

export default router;

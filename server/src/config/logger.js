import pino from 'pino';
import { Writable } from 'stream';
import { createWriteStream, mkdirSync } from 'fs';
import { resolve } from 'path';
import { env } from './env.js';

const isTest = env.nodeEnv === 'test';

// SSE clients registry — populated by /api/logs/stream connections (dev only)
const sseClients = new Set();
export function addSseClient(res) { sseClients.add(res); }
export function removeSseClient(res) { sseClients.delete(res); }

const streams = [];

if (isTest) {
  // Silence all output in test runs
  streams.push({ stream: new Writable({ write(c, e, cb) { cb(); } }) });
} else {
  streams.push({ stream: process.stdout });

  // File: info+ only (keeps debug spam out of the log file Promtail tails)
  const logsDir = resolve(process.cwd(), 'logs');
  mkdirSync(logsDir, { recursive: true });
  streams.push({
    stream: createWriteStream(resolve(logsDir, 'server.log'), { flags: 'a' }),
    level: 'info',
  });

  // SSE fan-out: every log line is pushed to /api/logs/stream subscribers (dev only)
  if (env.nodeEnv !== 'production') {
    const sseWritable = new Writable({
      write(chunk, _enc, cb) {
        if (sseClients.size > 0) {
          const data = `data: ${chunk.toString().trimEnd()}\n\n`;
          for (const res of sseClients) {
            try { res.write(data); } catch { sseClients.delete(res); }
          }
        }
        cb();
      },
    });
    streams.push({ stream: sseWritable });
  }
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (env.nodeEnv === 'production' ? 'info' : 'debug'),
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'a-meet' },
  },
  pino.multistream(streams),
);

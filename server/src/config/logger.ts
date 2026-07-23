import pino from 'pino';
import { Writable } from 'stream';
import { createWriteStream, mkdirSync } from 'fs';
import { resolve } from 'path';
import type { Response } from 'express';
import { env } from './env.js';

// SSE clients registry — populated by /api/logs/stream connections (dev only)
const sseClients = new Set<Response>();
export function addSseClient(res: Response) { sseClients.add(res); }
export function removeSseClient(res: Response) { sseClients.delete(res); }

// A selected logging target; `file` additionally carries a per-stream level.
type LogTarget =
  | { type: 'null' | 'stdout' | 'sse' }
  | { type: 'file'; level: string };

// Sensitive fields stripped from every log line, in every environment.
// `req.headers["x-bot-api-key"]` is the Discord bot's host-grade credential;
// pino-http serializes request headers, so it must be censored here.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-bot-api-key"]',
  '*.password',
  '*.token',
];

// Pure: which log targets are active for a given environment. Exported so the
// stream contract can be asserted in tests without constructing pino or touching
// the filesystem.
//   • test        → a single discarding stream (silent)
//   • production   → stdout only, so logs are structured JSON for an external
//                    collector; no local file and no SSE tail are created
//   • development  → stdout + local file (info+) + SSE live-tail (current behavior)
export function selectLogTargets(nodeEnv: string): LogTarget[] {
  if (nodeEnv === 'test') return [{ type: 'null' }];
  if (nodeEnv === 'production') return [{ type: 'stdout' }];
  return [
    { type: 'stdout' },
    { type: 'file', level: 'info' },
    { type: 'sse' },
  ];
}

// Pure: the pino instance options for a given environment. Exported for tests so
// the level/redaction/correlation contract can be checked without inspecting
// pino internals. Production defaults to `info`; LOG_LEVEL overrides everywhere.
export function buildLoggerOptions(nodeEnv: string, logLevel: string | undefined = process.env.LOG_LEVEL) {
  return {
    level: logLevel || (nodeEnv === 'production' ? 'info' : 'debug'),
    redact: REDACT_PATHS,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'a-meet' },
  };
}

function createNullStream() {
  return new Writable({ write(_chunk, _enc, cb) { cb(); } });
}

// SSE fan-out: every log line is pushed to /api/logs/stream subscribers (dev only).
function createSseStream() {
  return new Writable({
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
}

// Materialize selected targets into pino multistream entries. The file/SSE side
// effects (mkdir, open file handle) happen only when those targets are selected,
// so production never creates the local log file or an SSE stream.
function buildStreams(targets: LogTarget[]) {
  return targets.map((target) => {
    switch (target.type) {
      case 'null':
        return { stream: createNullStream() };
      case 'stdout':
        return { stream: process.stdout };
      case 'file': {
        // File: info+ only (keeps debug spam out of the log file Promtail tails).
        const logsDir = resolve(process.cwd(), 'logs');
        mkdirSync(logsDir, { recursive: true });
        return {
          stream: createWriteStream(resolve(logsDir, 'server.log'), { flags: 'a' }),
          level: target.level,
        };
      }
      case 'sse':
        return { stream: createSseStream() };
      default:
        throw new Error(`unknown log target: ${(target as { type: string }).type}`);
    }
  });
}

export const logger = pino(
  buildLoggerOptions(env.nodeEnv),
  pino.multistream(buildStreams(selectLogTargets(env.nodeEnv))),
);

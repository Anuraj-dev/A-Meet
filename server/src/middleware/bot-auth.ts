import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

// Header the Discord bot sends its API key in.
export const BOT_API_KEY_HEADER = 'x-bot-api-key';

// Constant-time comparison that also tolerates length differences (timingSafeEqual
// throws on unequal lengths). The key is never logged or echoed in responses.
function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Gate for the `/api/integrations/discord/*` routes ONLY. Wired exclusively onto
// those routes, so the bot API key is never an accepted credential anywhere else.
// If no key is configured the integration is effectively disabled (all requests
// rejected) rather than open.
export function requireBotAuth(req: Request, res: Response, next: NextFunction) {
  const expected = env.discord.botApiKey;
  const provided = req.get(BOT_API_KEY_HEADER) ?? '';
  if (!expected || !keysMatch(provided, expected)) {
    return res.status(401).json({ error: 'Invalid bot credentials' });
  }
  return next();
}

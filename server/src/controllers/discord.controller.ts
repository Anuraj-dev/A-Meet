import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { DiscordLink } from '../models/DiscordLink.js';
import { createUniqueRoom } from './room.controller.js';
import { mintLinkToken, verifyLinkToken } from '../integrations/discord/link-token.js';

// POST /api/integrations/discord/link-token (bot-key auth)
// Mint a short-lived token bound to the given Discord ID and hand the bot a
// ready-made confirmation URL to DM the user.
export function createLinkToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { discordId } = req.body as { discordId: string };
    const token = mintLinkToken(discordId);
    const linkUrl = `${env.clientUrl}/link/discord?token=${encodeURIComponent(token)}`;
    return res.status(201).json({ token, linkUrl });
  } catch (err) {
    return next(err);
  }
}

// POST /api/integrations/discord/link (user cookie auth)
// Verify the link token AND the auth cookie, then upsert the Discord↔user
// mapping. Re-linking a Discord ID overwrites the previous mapping in place.
export async function linkAccount(req: Request, res: Response, next: NextFunction) {
  let discordId: string;
  try {
    discordId = verifyLinkToken((req.body as { token: string }).token);
  } catch {
    return res.status(400).json({ error: 'This link is invalid or has expired. Run /meet link again.' });
  }
  try {
    await DiscordLink.findOneAndUpdate(
      { discordId },
      { discordId, userId: req.user!.id },
      { upsert: true, setDefaultsOnInsert: true },
    );
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// POST /api/integrations/discord/rooms (bot-key auth)
// Create an instant room hosted by the linked user — identical to POST /api/rooms.
// An unlinked Discord ID yields a distinct not-linked error the bot detects.
export async function createRoomForDiscord(req: Request, res: Response, next: NextFunction) {
  try {
    const { discordId } = req.body as { discordId: string };
    const link = await DiscordLink.findOne({ discordId });
    if (!link) {
      return res.status(404).json({ error: 'Discord account is not linked', code: 'not_linked' });
    }
    const room = await createUniqueRoom({ host: link.userId, admin: link.userId });
    if (!room) return res.status(500).json({ error: 'Could not generate a unique room code' });
    return res.status(201).json({ roomId: room.roomId });
  } catch (err) {
    return next(err);
  }
}

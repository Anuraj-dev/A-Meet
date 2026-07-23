import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireBotAuth } from '../middleware/bot-auth.js';
import { validate } from '../middleware/validate.js';
import { discordIdBodySchema, discordLinkBodySchema } from '../validation/discord.schema.js';
import {
  createLinkToken,
  linkAccount,
  createRoomForDiscord,
} from '../controllers/discord.controller.js';

// Discord integration API. Mounted at /api/integrations/discord. The bot-key
// gate is applied ONLY to these routes; user routes elsewhere never accept it.
const router = Router();

// Bot-key auth: called by the Discord bot process.
router.post('/link-token', requireBotAuth, validate(discordIdBodySchema), createLinkToken);
router.post('/rooms', requireBotAuth, validate(discordIdBodySchema), createRoomForDiscord);

// User cookie auth: called by the browser `/link/discord` confirmation page.
router.post('/link', requireAuth, validate(discordLinkBodySchema), linkAccount);

export default router;

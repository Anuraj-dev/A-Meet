import Joi from 'joi';

// Discord user IDs are snowflakes: numeric strings, currently 17–20 digits, but
// the width grows over time, so we bound generously rather than pin an exact
// length. Reject anything non-numeric.
const discordId = Joi.string()
  .trim()
  .pattern(/^\d{1,32}$/)
  .required()
  .messages({ 'string.pattern.base': 'Invalid Discord ID' });

// Body for POST /api/integrations/discord/link-token and .../rooms (bot-key auth).
export const discordIdBodySchema = Joi.object({ discordId });

// Body for POST /api/integrations/discord/link (user cookie auth).
export const discordLinkBodySchema = Joi.object({
  token: Joi.string().trim().min(1).required().messages({
    'string.empty': 'Missing link token',
    'any.required': 'Missing link token',
  }),
});

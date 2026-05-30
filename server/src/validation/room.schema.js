import Joi from 'joi';

// Google Meet-style room code: xxx-xxxx-xxx (lowercase letters).
export const roomIdParamSchema = Joi.object({
  roomId: Joi.string()
    .pattern(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/)
    .required()
    .messages({ 'string.pattern.base': 'Invalid room code format' }),
});

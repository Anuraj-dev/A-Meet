import Joi from 'joi';

// Google Meet-style room code: xxx-xxxx-xxx (lowercase letters).
export const roomIdParamSchema = Joi.object({
  roomId: Joi.string()
    .pattern(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/)
    .required()
    .messages({ 'string.pattern.base': 'Invalid room code format' }),
});

// Body for scheduling a new meeting (POST /api/rooms/scheduled).
export const scheduleBodySchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required().messages({
    'string.empty': 'Give your meeting a title',
    'any.required': 'Give your meeting a title',
  }),
  scheduledFor: Joi.date().iso().greater('now').required().messages({
    'date.greater': 'Pick a time in the future',
    'any.required': 'Pick a date and time',
  }),
  description: Joi.string().trim().max(2000).allow('').default(''),
});

// Body for editing a scheduled meeting (PATCH /api/rooms/scheduled/:roomId).
// All fields optional, but at least one must be present. `greater('now')` is
// intentionally dropped so editing a meeting whose start just slipped past works.
export const scheduleUpdateSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200),
  scheduledFor: Joi.date().iso(),
  description: Joi.string().trim().max(2000).allow(''),
})
  .min(1)
  .messages({ 'object.min': 'Nothing to update' });

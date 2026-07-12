import Joi from 'joi';

// Joi schemas for the SFU Socket.io event payloads. The HTTP layer validates
// 100% of its routes with Joi (via middleware/validate.ts); the socket layer
// historically validated nothing. These schemas bring the SFU events up to the
// same rigor, applied at the top of each handler through `validateSfuPayload`.

// Google Meet-style room code — same regex as the REST layer's roomIdParamSchema
// (validation/room.schema.ts) so the socket and HTTP entry points agree on what a
// valid room id is. `.lowercase()` mirrors the REST controller, which lowercases
// the lookup so an uppercased code (mobile autocapitalize / hand-edited URL) still
// resolves instead of minting a second Router for the same room.
const roomIdField = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/)
  .required()
  .messages({
    'string.empty': 'roomId required',
    'any.required': 'roomId required',
    'string.pattern.base': 'Invalid room code',
  });

// A short opaque id string (transport / producer / consumer / socket id). We only
// assert it is a non-empty, bounded string — the real object lookup happens in the
// room store, which returns "not found" for anything unknown.
const idField = Joi.string().min(1).max(200);

// mediasoup parameter blobs (rtpParameters, dtlsParameters, rtpCapabilities) are
// large, codec-negotiated objects we forward verbatim to the native worker, which
// does the authoritative structural validation and rejects malformed input. Here
// we only assert they are objects — blocking non-object junk (strings, arrays,
// numbers) at the signaling edge — while allowing any nested shape.
const opaqueObject = Joi.object().unknown(true);

export const sfuSchemas = {
  'sfu-get-rtp-capabilities': Joi.object({ roomId: roomIdField }),
  'sfu-create-transport': Joi.object({
    direction: Joi.string().valid('send', 'recv').required()
      .messages({ 'any.only': 'bad direction', 'any.required': 'bad direction', 'string.base': 'bad direction' }),
  }),
  'sfu-connect-transport': Joi.object({
    transportId: idField.required(),
    dtlsParameters: opaqueObject.required(),
  }),
  'sfu-produce': Joi.object({
    transportId: idField.required(),
    kind: Joi.string().valid('audio', 'video').required(),
    rtpParameters: opaqueObject.required(),
    appData: Joi.object().unknown(true).default({}),
  }),
  'sfu-consume': Joi.object({
    transportId: idField.required(),
    producerId: idField.required(),
    rtpCapabilities: opaqueObject.required(),
  }),
  // A newcomer's request for the room's existing producers carries no fields; we
  // still assert it is an object (not a string/array/number) so malformed junk is
  // rejected at the edge like every other event, rather than acked as success.
  'sfu-get-producers': Joi.object({}),
  'sfu-resume-consumer': Joi.object({ consumerId: idField.required() }),
  'sfu-pause-producer': Joi.object({ producerId: idField.required() }),
  'sfu-resume-producer': Joi.object({ producerId: idField.required() }),
  'sfu-close-producer': Joi.object({ producerId: idField.required() }),
  'sfu-raise-hand': Joi.object({ raised: Joi.boolean().required() }),
  'sfu-reaction': Joi.object({ emoji: Joi.string().min(1).max(64).required() }),
  'sfu-host-mute': Joi.object({ socketId: idField.required() }),
  'sfu-host-remove': Joi.object({ socketId: idField.required() }),
  'sfu-request-unmute': Joi.object({ socketId: idField.required() }),
  'sfu-spotlight': Joi.object({ socketId: idField.allow(null).default(null) }),
} as const;

export type SfuValidatedEvent = keyof typeof sfuSchemas;

// Validate a socket payload against its schema. Returns the coerced value (with
// defaults applied and unknown top-level keys stripped) and an error string, or
// null when valid — mirroring the HTTP `validate` middleware's contract so the
// two layers read the same way.
export function validateSfuPayload<T = Record<string, unknown>>(
  schema: Joi.ObjectSchema,
  payload: unknown,
): { error: string | null; value: T } {
  const { error, value } = schema.validate(payload ?? {}, {
    abortEarly: true,
    stripUnknown: true,
    convert: true,
  });
  return { error: error ? error.message : null, value: value as T };
}

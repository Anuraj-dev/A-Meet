import { describe, it, expect } from 'vitest';
import { roomIdParamSchema } from '../src/validation/room.schema.js';

const validate = (roomId) => roomIdParamSchema.validate({ roomId });

describe('roomIdParamSchema', () => {
  it('accepts a well-formed Meet-style code (xxx-xxxx-xxx, lowercase)', () => {
    const { error, value } = validate('abc-defg-hij');
    expect(error).toBeUndefined();
    expect(value.roomId).toBe('abc-defg-hij');
  });

  it.each([
    ['uppercase letters', 'ABC-defg-hij'],
    ['digits', 'abc-def1-hij'],
    ['wrong segment lengths', 'ab-defg-hij'],
    ['missing a segment', 'abc-defg'],
    ['no hyphens', 'abcdefghij'],
    ['empty string', ''],
  ])('rejects %s', (_label, roomId) => {
    const { error } = validate(roomId);
    expect(error).toBeDefined();
  });

  it('surfaces the friendly format message on a malformed code', () => {
    const { error } = validate('nope');
    expect(error.details[0].message).toBe('Invalid room code format');
  });

  it('requires roomId to be present', () => {
    const { error } = roomIdParamSchema.validate({});
    expect(error).toBeDefined();
  });
});

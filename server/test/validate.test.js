import { describe, it, expect, vi } from 'vitest';
import Joi from 'joi';
import { validate } from '../src/middleware/validate.js';

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const schema = Joi.object({
  name: Joi.string().min(2).required(),
  age: Joi.number().integer().min(0),
});

describe('validate middleware', () => {
  it('calls next and writes the validated value back on success', () => {
    const req = { body: { name: 'Anuraj', age: 22 } };
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: 'Anuraj', age: 22 });
    expect(res.statusCode).toBe(200);
  });

  it('strips unknown keys from the request', () => {
    const req = { body: { name: 'Anuraj', hacker: 'drop table' } };
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: 'Anuraj' });
    expect(req.body.hacker).toBeUndefined();
  });

  it('400s with joined messages and does not call next on invalid input', () => {
    const req = { body: { name: 'A' } }; // too short
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error).toMatch(/name/);
  });

  it('validates a non-body property when told to (e.g. params)', () => {
    const paramSchema = Joi.object({ id: Joi.string().required() });
    const req = { params: {} };
    const res = mockRes();
    const next = vi.fn();

    validate(paramSchema, 'params')(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });
});

import type { Request, Response, NextFunction } from 'express';
import type { Schema } from 'joi';

// Generic Joi validation middleware. Validates a given request property
// (body | params | query) against a schema; responds 400 on failure.
export function validate(schema: Schema, property: 'body' | 'params' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const target = req as unknown as Record<string, unknown>;
    const { error, value } = schema.validate(target[property], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.details.map((d) => d.message).join(', ') });
    }
    target[property] = value;
    next();
  };
}

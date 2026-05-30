// Generic Joi validation middleware. Validates a given request property
// (body | params | query) against a schema; responds 400 on failure.
export function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.details.map((d) => d.message).join(', ') });
    }
    req[property] = value;
    next();
  };
}

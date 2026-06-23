import { describe, expect, it } from 'vitest';
import { selectLogTargets, buildLoggerOptions, REDACT_PATHS } from '../src/config/logger.js';

// These assert the observable stream-selection and options contract directly,
// without constructing pino, touching the filesystem, or writing logs.

describe('selectLogTargets', () => {
  it('production emits stdout only — no local file, no SSE', () => {
    const targets = selectLogTargets('production');
    const types = targets.map((t) => t.type);
    expect(types).toEqual(['stdout']);
    expect(types).not.toContain('file');
    expect(types).not.toContain('sse');
  });

  it('development keeps stdout + local file (info+) + SSE tail', () => {
    const targets = selectLogTargets('development');
    expect(targets.map((t) => t.type)).toEqual(['stdout', 'file', 'sse']);
    const file = targets.find((t) => t.type === 'file');
    expect(file.level).toBe('info');
  });

  it('an unknown / default environment is treated like development', () => {
    expect(selectLogTargets(undefined).map((t) => t.type)).toEqual(['stdout', 'file', 'sse']);
  });

  it('test environment is a single discarding stream', () => {
    expect(selectLogTargets('test').map((t) => t.type)).toEqual(['null']);
  });
});

describe('buildLoggerOptions', () => {
  it('production defaults to info level', () => {
    expect(buildLoggerOptions('production', undefined).level).toBe('info');
  });

  it('development defaults to debug level', () => {
    expect(buildLoggerOptions('development', undefined).level).toBe('debug');
  });

  it('LOG_LEVEL override wins in every environment', () => {
    expect(buildLoggerOptions('production', 'warn').level).toBe('warn');
    expect(buildLoggerOptions('development', 'error').level).toBe('error');
  });

  it('redacts the sensitive fields and keeps structured service/correlation base', () => {
    const opts = buildLoggerOptions('production', undefined);
    expect(opts.redact).toEqual(REDACT_PATHS);
    expect(opts.redact).toContain('req.headers.authorization');
    expect(opts.redact).toContain('req.headers.cookie');
    expect(opts.redact).toContain('*.password');
    expect(opts.redact).toContain('*.token');
    expect(opts.base).toEqual({ service: 'a-meet' });
    // ISO timestamps keep log lines correlatable across collectors.
    expect(typeof opts.timestamp).toBe('function');
  });
});

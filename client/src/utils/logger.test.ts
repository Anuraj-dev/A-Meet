import { describe, expect, it } from 'vitest';
import { resolveClientLogEndpoint } from './logger';

describe('resolveClientLogEndpoint', () => {
  it('uses a relative endpoint when no API origin is configured', () => {
    expect(resolveClientLogEndpoint('')).toBe('/api/logs/client');
    expect(resolveClientLogEndpoint()).toMatch(/\/api\/logs\/client$/);
  });

  it('targets the API origin in production-style deployments', () => {
    expect(resolveClientLogEndpoint('https://api.ameet.raja-dev.me')).toBe(
      'https://api.ameet.raja-dev.me/api/logs/client',
    );
  });

  it('avoids double slashes when the API origin already has a trailing slash', () => {
    expect(resolveClientLogEndpoint('https://api.ameet.raja-dev.me/')).toBe(
      'https://api.ameet.raja-dev.me/api/logs/client',
    );
  });
});

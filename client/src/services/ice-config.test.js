import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ice-config reads `import.meta.env` at module-eval time, so each scenario stubs
// the env and re-imports the module fresh.
async function loadIce() {
  return import('./ice-config.js');
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('services/ice-config', () => {
  it('defaults to STUN-only with "all" transport policy when no TURN is configured', async () => {
    vi.stubEnv('VITE_TURN_DOMAIN', '');
    vi.stubEnv('VITE_TURN_SECRET', '');

    const { ICE_SERVERS, ICE_TRANSPORT_POLICY } = await loadIce();

    expect(ICE_SERVERS).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]);
    expect(ICE_TRANSPORT_POLICY).toBe('all');
  });

  it('appends udp/tcp/tls relay servers (with credentials) when TURN is configured', async () => {
    vi.stubEnv('VITE_TURN_DOMAIN', 'turn.example.com');
    vi.stubEnv('VITE_TURN_USERNAME', 'relay-user');
    vi.stubEnv('VITE_TURN_SECRET', 'relay-secret');

    const { ICE_SERVERS } = await loadIce();

    // Two Google STUN servers + three TURN relay transports.
    expect(ICE_SERVERS).toHaveLength(5);
    expect(ICE_SERVERS).toContainEqual({
      urls: 'turn:turn.example.com:3478?transport=udp', username: 'relay-user', credential: 'relay-secret',
    });
    expect(ICE_SERVERS).toContainEqual({
      urls: 'turn:turn.example.com:3478?transport=tcp', username: 'relay-user', credential: 'relay-secret',
    });
    expect(ICE_SERVERS).toContainEqual({
      urls: 'turns:turn.example.com:5349?transport=tcp', username: 'relay-user', credential: 'relay-secret',
    });
  });

  it('ignores VITE_FORCE_RELAY unless TURN is actually configured', async () => {
    vi.stubEnv('VITE_FORCE_RELAY', '1');
    vi.stubEnv('VITE_TURN_DOMAIN', '');
    vi.stubEnv('VITE_TURN_SECRET', '');

    const { ICE_TRANSPORT_POLICY } = await loadIce();
    expect(ICE_TRANSPORT_POLICY).toBe('all');
  });

  it('forces the "relay" transport policy when TURN is configured and VITE_FORCE_RELAY=1', async () => {
    vi.stubEnv('VITE_FORCE_RELAY', '1');
    vi.stubEnv('VITE_TURN_DOMAIN', 'turn.example.com');
    vi.stubEnv('VITE_TURN_USERNAME', 'relay-user');
    vi.stubEnv('VITE_TURN_SECRET', 'relay-secret');

    const { ICE_TRANSPORT_POLICY } = await loadIce();
    expect(ICE_TRANSPORT_POLICY).toBe('relay');
  });
});

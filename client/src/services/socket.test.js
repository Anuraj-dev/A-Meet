import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the socket.io-client factory so we can assert how the app constructs its
// singleton socket without opening a real connection.
const { ioMock } = vi.hoisted(() => ({ ioMock: vi.fn(() => ({ id: 'fake-socket' })) }));
vi.mock('socket.io-client', () => ({ io: ioMock }));

beforeEach(() => {
  vi.resetModules();
  ioMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('services/socket', () => {
  it('constructs the client with the env server URL, credentials on, and autoConnect off', async () => {
    vi.stubEnv('VITE_SERVER_URL', 'http://localhost:9999');

    const { default: socket } = await import('./socket.js');

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledWith('http://localhost:9999', {
      withCredentials: true,
      autoConnect: false,
    });
    // The module exports whatever the factory returned (the singleton instance).
    expect(socket).toEqual({ id: 'fake-socket' });
  });
});

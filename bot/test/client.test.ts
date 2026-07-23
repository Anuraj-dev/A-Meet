import { describe, it, expect, vi } from 'vitest';
import {
  DiscordIntegrationClient,
  NotLinkedError,
  IntegrationHttpError,
  type FetchLike,
} from '../src/http/client.js';

// Build a fake fetch that returns a single canned response and records its call.
function fakeFetch(status: number, body: unknown): { impl: FetchLike; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const impl: FetchLike = vi.fn(async (input, init) => {
    calls.push([input, init]);
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    };
  });
  return { impl, calls };
}

function makeClient(impl: FetchLike) {
  return new DiscordIntegrationClient({
    serverUrl: 'http://server:5000',
    apiKey: 'test-key',
    fetchImpl: impl,
  });
}

describe('DiscordIntegrationClient.createLinkToken', () => {
  it('POSTs to the link-token endpoint with the bot key header and discordId body', async () => {
    const { impl, calls } = fakeFetch(201, {
      token: 'jwt',
      linkUrl: 'http://client/link/discord?token=jwt',
    });
    const result = await makeClient(impl).createLinkToken('123');

    expect(result).toEqual({ token: 'jwt', linkUrl: 'http://client/link/discord?token=jwt' });
    const [url, init] = calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe('http://server:5000/api/integrations/discord/link-token');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Bot-Api-Key']).toBe('test-key');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ discordId: '123' });
  });

  it('throws IntegrationHttpError on a non-success status (e.g. bad key)', async () => {
    const { impl } = fakeFetch(401, { error: 'Invalid bot credentials' });
    await expect(makeClient(impl).createLinkToken('123')).rejects.toBeInstanceOf(
      IntegrationHttpError,
    );
  });
});

describe('DiscordIntegrationClient.createRoom', () => {
  it('returns the roomId on 201', async () => {
    const { impl, calls } = fakeFetch(201, { roomId: 'abc-defg-hij' });
    const result = await makeClient(impl).createRoom('123');

    expect(result).toEqual({ roomId: 'abc-defg-hij' });
    const [url] = calls[0] as [string];
    expect(url).toBe('http://server:5000/api/integrations/discord/rooms');
  });

  it('throws NotLinkedError on a 404 with code not_linked', async () => {
    const { impl } = fakeFetch(404, { error: 'Discord account is not linked', code: 'not_linked' });
    await expect(makeClient(impl).createRoom('123')).rejects.toBeInstanceOf(NotLinkedError);
  });

  it('throws IntegrationHttpError on a 404 without the not_linked code', async () => {
    const { impl } = fakeFetch(404, { error: 'nope' });
    const err = await makeClient(impl).createRoom('123').catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationHttpError);
    expect(err).not.toBeInstanceOf(NotLinkedError);
  });

  it('throws IntegrationHttpError on a 500', async () => {
    const { impl } = fakeFetch(500, { error: 'boom' });
    const err = await makeClient(impl).createRoom('123').catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationHttpError);
    expect((err as IntegrationHttpError).status).toBe(500);
  });

  it('propagates a network-level fetch rejection', async () => {
    const impl: FetchLike = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(makeClient(impl).createRoom('123')).rejects.toThrow('ECONNREFUSED');
  });
});

describe('DiscordIntegrationClient request timeout', () => {
  it('aborts and rejects when the server never completes the response', async () => {
    vi.useFakeTimers();
    // A server that accepts the connection but never responds; it only settles
    // when the abort signal fires.
    const impl: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted', 'AbortError')),
        );
      });
    const client = new DiscordIntegrationClient({
      serverUrl: 'http://server:5000',
      apiKey: 'k',
      fetchImpl: impl,
      requestTimeoutMs: 5000,
    });

    const pending = client.createRoom('1');
    const assertion = expect(pending).rejects.toThrow(/abort/i);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    vi.useRealTimers();
  });

  it('passes an abort signal to fetch and clears the timer on success', async () => {
    const { impl, calls } = fakeFetch(201, { roomId: 'x' });
    await makeClient(impl).createRoom('1');
    const [, init] = calls[0] as [string, { signal?: AbortSignal }];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // Timer was cleared on completion, so the signal is not aborted afterwards.
    expect(init.signal?.aborted).toBe(false);
  });
});

describe('DiscordIntegrationClient base URL handling', () => {
  it('does not produce a double slash when serverUrl has a trailing slash', async () => {
    const { impl, calls } = fakeFetch(201, { roomId: 'x' });
    await new DiscordIntegrationClient({
      serverUrl: 'http://server:5000/',
      apiKey: 'k',
      fetchImpl: impl,
    }).createRoom('1');
    const [url] = calls[0] as [string];
    expect(url).toBe('http://server:5000/api/integrations/discord/rooms');
  });
});

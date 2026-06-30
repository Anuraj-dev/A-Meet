import { describe, expect, it, vi } from 'vitest';
import { loadSsmEnvironment } from '../src/ssm-entrypoint.js';

describe('loadSsmEnvironment', () => {
  it('loads every parameter page, decrypts values, and exports leaf names', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Parameters: [
          { Name: '/a-meet/prod/MONGO_URI', Value: 'mongodb://prod' },
          { Name: '/a-meet/prod/JWT_SECRET', Value: 'secret' },
        ],
        NextToken: 'page-2',
      })
      .mockResolvedValueOnce({
        Parameters: [{ Name: '/a-meet/prod/GOOGLE_CLIENT_ID', Value: 'client-id' }],
      });
    const target = {};

    const loaded = await loadSsmEnvironment({
      prefix: '/a-meet/prod',
      client: { send },
      target,
    });

    expect(loaded).toBe(3);
    expect(target).toEqual({
      MONGO_URI: 'mongodb://prod',
      JWT_SECRET: 'secret',
      GOOGLE_CLIENT_ID: 'client-id',
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Path: '/a-meet/prod',
      Recursive: false,
      WithDecryption: true,
    });
    expect(send.mock.calls[1][0].input.NextToken).toBe('page-2');
  });

  it('does not overwrite an explicitly supplied runtime value', async () => {
    const target = { JWT_SECRET: 'deployment-override' };
    const client = {
      send: vi.fn().mockResolvedValue({
        Parameters: [{ Name: '/a-meet/prod/JWT_SECRET', Value: 'ssm-value' }],
      }),
    };

    await loadSsmEnvironment({ prefix: '/a-meet/prod', client, target });

    expect(target.JWT_SECRET).toBe('deployment-override');
  });

  it('rejects malformed or valueless parameters instead of starting partially configured', async () => {
    const client = {
      send: vi.fn().mockResolvedValue({
        Parameters: [{ Name: '/a-meet/prod/', Value: 'bad' }],
      }),
    };

    await expect(
      loadSsmEnvironment({ prefix: '/a-meet/prod', client, target: {} }),
    ).rejects.toThrow('Invalid SSM parameter');
  });
});

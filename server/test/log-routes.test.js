import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { logger } from '../src/config/logger.js';

let app;

beforeAll(() => {
  app = createApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/logs/client', () => {
  it('records batched client diagnostics with the client source tag', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    const res = await request(app)
      .post('/api/logs/client')
      .set('X-Forwarded-For', '127.0.0.1')
      .send({
        logs: [
          { level: 'info', msg: 'sfu-stage', stage: 'setup-started', roomId: 'abc-defg-hij' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        src: 'client',
        stage: 'setup-started',
        roomId: 'abc-defg-hij',
      }),
      'sfu-stage',
    );
  });
});

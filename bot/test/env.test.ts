import { describe, it, expect } from 'vitest';
import { loadBotEnv } from '../src/config/env.js';

const full = {
  DISCORD_TOKEN: 'tok',
  DISCORD_CLIENT_ID: 'cid',
  SERVER_URL: 'http://localhost:5000',
  CLIENT_URL: 'http://localhost:5173',
  DISCORD_BOT_API_KEY: 'secret',
};

describe('loadBotEnv', () => {
  it('returns a typed config when all required vars are present', () => {
    const config = loadBotEnv(full);
    expect(config).toEqual({
      discordToken: 'tok',
      discordClientId: 'cid',
      serverUrl: 'http://localhost:5000',
      clientUrl: 'http://localhost:5173',
      botApiKey: 'secret',
    });
  });

  it('includes the guild id only when provided', () => {
    expect(loadBotEnv(full).discordGuildId).toBeUndefined();
    expect(loadBotEnv({ ...full, DISCORD_GUILD_ID: 'gid' }).discordGuildId).toBe('gid');
  });

  it('trims surrounding whitespace from values', () => {
    const config = loadBotEnv({ ...full, DISCORD_TOKEN: '  spaced  ' });
    expect(config.discordToken).toBe('spaced');
  });

  it('throws listing every missing required variable', () => {
    expect(() => loadBotEnv({ DISCORD_TOKEN: 'tok' })).toThrow(
      /DISCORD_CLIENT_ID.*SERVER_URL.*CLIENT_URL.*DISCORD_BOT_API_KEY/,
    );
  });

  it('treats blank/whitespace-only values as missing', () => {
    expect(() => loadBotEnv({ ...full, DISCORD_BOT_API_KEY: '   ' })).toThrow(
      /DISCORD_BOT_API_KEY/,
    );
  });
});

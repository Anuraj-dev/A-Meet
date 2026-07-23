// Typed, validated bot configuration. `loadBotEnv` is pure over its input source
// (defaults to process.env) so it is unit-testable off the real environment.
// Missing required values throw a single aggregated error — the process
// entrypoint turns that into a clean exit rather than a half-configured bot.

export interface BotConfig {
  /** Discord bot token used to log the gateway client in. */
  discordToken: string;
  /** Discord application (client) id — needed to register slash commands. */
  discordClientId: string;
  /**
   * Optional guild id. When set, `register-commands` installs the commands to
   * that single guild (instant, ideal for dev); when unset it registers them
   * globally (can take up to an hour to propagate).
   */
  discordGuildId?: string;
  /** Base URL of the A-Meet API server, e.g. http://localhost:5000. */
  serverUrl: string;
  /** Base URL of the A-Meet web client, used to build public meeting links. */
  clientUrl: string;
  /** Shared secret presented to the /api/integrations/discord/* endpoints. */
  botApiKey: string;
}

type EnvSource = Record<string, string | undefined>;

function required(source: EnvSource, key: string, missing: string[]): string {
  const value = source[key]?.trim();
  if (!value) {
    missing.push(key);
    return '';
  }
  return value;
}

/**
 * Read and validate the bot configuration. Throws if any required variable is
 * absent so the process fails fast with an actionable message instead of
 * booting into an unauthenticated/broken state.
 */
export function loadBotEnv(source: EnvSource = process.env): BotConfig {
  const missing: string[] = [];
  const config: BotConfig = {
    discordToken: required(source, 'DISCORD_TOKEN', missing),
    discordClientId: required(source, 'DISCORD_CLIENT_ID', missing),
    serverUrl: required(source, 'SERVER_URL', missing),
    clientUrl: required(source, 'CLIENT_URL', missing),
    botApiKey: required(source, 'DISCORD_BOT_API_KEY', missing),
  };
  const guildId = source.DISCORD_GUILD_ID?.trim();
  if (guildId) config.discordGuildId = guildId;

  if (missing.length > 0) {
    throw new Error(
      `Missing required bot environment variable(s): ${missing.join(', ')}. ` +
        'See bot/.env.example.',
    );
  }
  return config;
}

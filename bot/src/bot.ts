import { Client, GatewayIntentBits, Events } from 'discord.js';
import type { BotConfig } from './config/env.js';
import { DiscordIntegrationClient } from './http/client.js';
import { dispatchInteraction } from './interactions.js';

// Gateway bootstrap: builds the discord.js client, wires the interaction router,
// and logs in. Only the Guilds intent is needed — slash commands don't require
// the privileged Message Content intent. Not unit-tested (it talks to the real
// Discord gateway); the routing logic it delegates to lives in interactions.ts.
export function createBot(config: BotConfig): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  const api = new DiscordIntegrationClient({
    serverUrl: config.serverUrl,
    apiKey: config.botApiKey,
  });

  client.once(Events.ClientReady, (ready) => {
    console.log(`Discord bot logged in as ${ready.user.tag}`);
  });

  // dispatchInteraction owns the try/catch safety net (including recovery for
  // already-deferred interactions), so a thrown handler never leaves a spinner.
  client.on(Events.InteractionCreate, (interaction) => {
    void dispatchInteraction(interaction, api, config.clientUrl);
  });

  return client;
}

export async function startBot(config: BotConfig): Promise<Client> {
  const client = createBot(config);
  await client.login(config.discordToken);
  return client;
}

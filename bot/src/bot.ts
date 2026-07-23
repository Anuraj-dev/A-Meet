import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import type { BotConfig } from './config/env.js';
import { DiscordIntegrationClient } from './http/client.js';
import { handleInteraction } from './interactions.js';

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

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await handleInteraction(interaction, api, config.clientUrl);
    } catch (err) {
      console.error('Unhandled interaction error:', err);
      // Best-effort friendly answer so a crash never leaves the user staring at
      // a spinner. Both reply and followUp can throw if the token expired; ignore.
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: 'Something went wrong. Please try again.',
            flags: MessageFlags.Ephemeral,
          });
        } catch {
          /* interaction already gone — nothing more we can do */
        }
      }
    }
  });

  return client;
}

export async function startBot(config: BotConfig): Promise<Client> {
  const client = createBot(config);
  await client.login(config.discordToken);
  return client;
}

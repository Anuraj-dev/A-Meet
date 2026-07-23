import { MessageFlags } from 'discord.js';
import type { Interaction } from 'discord.js';
import { DiscordIntegrationClient } from './http/client.js';
import { handleLink, handleCreate } from './commands/handlers.js';

// Single interaction router. Kept separate from the gateway bootstrap so it can
// be unit-tested with a mocked interaction and HTTP client.
export async function handleInteraction(
  interaction: Interaction,
  client: DiscordIntegrationClient,
  clientUrl: string,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'meet') return;

  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'link':
      await handleLink(interaction, client);
      return;
    case 'create':
      await handleCreate(interaction, client, clientUrl);
      return;
    default:
      // Unknown subcommand — should be impossible given registration, but never
      // leave the interaction unanswered.
      await interaction.reply({
        content: 'Unknown command.',
        flags: MessageFlags.Ephemeral,
      });
  }
}

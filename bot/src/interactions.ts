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

// Top-level safety net around the router. If routing throws AFTER the handler
// already deferred/replied (e.g. an editReply/followUp rejects), the interaction
// must still be resolved — a bare `!deferred` guard would skip exactly those
// common cases and leave the user staring at a spinner. Best-effort: if the
// recovery call itself rejects, there is nothing more we can do.
export async function dispatchInteraction(
  interaction: Interaction,
  client: DiscordIntegrationClient,
  clientUrl: string,
): Promise<void> {
  try {
    await handleInteraction(interaction, client, clientUrl);
  } catch (err) {
    console.error('Unhandled interaction error:', err);
    if (!interaction.isRepliable()) return;
    const content = 'Something went wrong. Please try again.';
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    } catch {
      // Interaction already gone / API failing — nothing more we can do.
    }
  }
}

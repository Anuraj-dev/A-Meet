import { EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  DiscordIntegrationClient,
  NotLinkedError,
} from '../http/client.js';

// Command handlers: thin glue between a Discord interaction and the integration
// HTTP client. Every path answers the interaction — success or failure, never
// silence. Private answers use MessageFlags.Ephemeral (only the invoker sees
// them); the meeting announcement is a public channel embed.

const GENERIC_ERROR = 'Something went wrong talking to A-Meet. Please try again in a moment.';

/**
 * `/meet link` — mint an account-link token and DM-style ephemeral reply the
 * confirmation URL so only the requester sees it.
 */
export async function handleLink(
  interaction: ChatInputCommandInteraction,
  client: DiscordIntegrationClient,
): Promise<void> {
  try {
    const { linkUrl } = await client.createLinkToken(interaction.user.id);
    await interaction.reply({
      content:
        `Link your A-Meet account: ${linkUrl}\n` +
        'Open it in your browser while signed in to A-Meet. The link expires in ~10 minutes.',
      flags: MessageFlags.Ephemeral,
    });
  } catch {
    await interaction.reply({
      content: GENERIC_ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * `/meet create` — create an instant meeting hosted by the linked user and post
 * a public embed with the join link. Not-linked users get an ephemeral nudge to
 * run `/meet link`; any other failure gets an ephemeral friendly error.
 */
export async function handleCreate(
  interaction: ChatInputCommandInteraction,
  client: DiscordIntegrationClient,
  clientUrl: string,
): Promise<void> {
  let roomId: string;
  try {
    ({ roomId } = await client.createRoom(interaction.user.id));
  } catch (err) {
    if (err instanceof NotLinkedError) {
      await interaction.reply({
        content: 'Link your account first with `/meet link`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      content: GENERIC_ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const meetingUrl = buildMeetingUrl(clientUrl, roomId);
  const embed = new EmbedBuilder()
    .setTitle('A-Meet meeting started')
    .setDescription(`[Join the meeting](${meetingUrl})`)
    .addFields(
      { name: 'Link', value: meetingUrl },
      { name: 'Started by', value: interaction.user.toString() },
    );

  await interaction.reply({ embeds: [embed] });
}

/**
 * Public join URL — matches the client's own `buildJoinUrl`
 * (`<client>/lobby/<roomId>`, the RoomGuard → LobbyPage entry point).
 */
export function buildMeetingUrl(clientUrl: string, roomId: string): string {
  return `${clientUrl.replace(/\/+$/, '')}/lobby/${encodeURIComponent(roomId)}`;
}

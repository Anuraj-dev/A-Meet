import { EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  DiscordIntegrationClient,
  NotLinkedError,
} from '../http/client.js';

// Command handlers: thin glue between a Discord interaction and the integration
// HTTP client. Every path answers the interaction — success or failure, never
// silence.
//
// Discord invalidates an interaction token if no initial response is sent within
// ~3 seconds, and the API call can take longer (cold start, slow network). So
// each handler defers IMMEDIATELY, then edits/follows-up once the call returns.
// The deferred reply is ephemeral, so every private outcome (link URL, not-linked
// nudge, errors) is edited in as ephemeral. The one PUBLIC surface — the meeting
// announcement — is sent as a separate non-ephemeral followUp, so success stays
// visible to the whole channel while failures stay private to the invoker.

const GENERIC_ERROR = 'Something went wrong talking to A-Meet. Please try again in a moment.';

/**
 * `/meet link` — mint an account-link token and ephemerally reply the
 * confirmation URL so only the requester sees it.
 */
export async function handleLink(
  interaction: ChatInputCommandInteraction,
  client: DiscordIntegrationClient,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const { linkUrl } = await client.createLinkToken(interaction.user.id);
    await interaction.editReply({
      content:
        `Link your A-Meet account: ${linkUrl}\n` +
        'Open it in your browser while signed in to A-Meet. The link expires in ~10 minutes.',
    });
  } catch {
    await interaction.editReply({ content: GENERIC_ERROR });
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let roomId: string;
  try {
    ({ roomId } = await client.createRoom(interaction.user.id));
  } catch (err) {
    if (err instanceof NotLinkedError) {
      await interaction.editReply({ content: 'Link your account first with `/meet link`.' });
      return;
    }
    await interaction.editReply({ content: GENERIC_ERROR });
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

  // Public channel announcement (non-ephemeral): everyone can see and join.
  await interaction.followUp({ embeds: [embed] });
  // Resolve the ephemeral deferred reply with a private confirmation.
  await interaction.editReply({ content: 'Meeting created — join link posted in the channel.' });
}

/**
 * Public join URL — matches the client's own `buildJoinUrl`
 * (`<client>/lobby/<roomId>`, the RoomGuard → LobbyPage entry point).
 */
export function buildMeetingUrl(clientUrl: string, roomId: string): string {
  return `${clientUrl.replace(/\/+$/, '')}/lobby/${encodeURIComponent(roomId)}`;
}

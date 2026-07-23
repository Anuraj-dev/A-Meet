import { describe, it, expect, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import type { Interaction } from 'discord.js';
import { handleInteraction } from '../src/interactions.js';
import { DiscordIntegrationClient } from '../src/http/client.js';

function mockClient() {
  return {
    createLinkToken: vi.fn().mockResolvedValue({ token: 't', linkUrl: 'http://l' }),
    createRoom: vi.fn().mockResolvedValue({ roomId: 'r' }),
  } as unknown as DiscordIntegrationClient;
}

// Build a chat-input `/meet` interaction for the given subcommand.
function meetInteraction(sub: string) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    isChatInputCommand: () => true,
    commandName: 'meet',
    options: { getSubcommand: () => sub },
    user: { id: '7', toString: () => '<@7>' },
    reply,
  } as unknown as Interaction;
  return { interaction, reply };
}

describe('handleInteraction', () => {
  it('routes /meet link to the link handler (mints a token)', async () => {
    const client = mockClient();
    const { interaction } = meetInteraction('link');
    await handleInteraction(interaction, client, 'http://client');
    expect(client.createLinkToken).toHaveBeenCalledWith('7');
    expect(client.createRoom).not.toHaveBeenCalled();
  });

  it('routes /meet create to the create handler (creates a room)', async () => {
    const client = mockClient();
    const { interaction } = meetInteraction('create');
    await handleInteraction(interaction, client, 'http://client');
    expect(client.createRoom).toHaveBeenCalledWith('7');
    expect(client.createLinkToken).not.toHaveBeenCalled();
  });

  it('ignores non chat-input interactions', async () => {
    const client = mockClient();
    const reply = vi.fn();
    const interaction = { isChatInputCommand: () => false, reply } as unknown as Interaction;
    await handleInteraction(interaction, client, 'http://client');
    expect(reply).not.toHaveBeenCalled();
    expect(client.createLinkToken).not.toHaveBeenCalled();
  });

  it('ignores commands other than /meet', async () => {
    const client = mockClient();
    const reply = vi.fn();
    const interaction = {
      isChatInputCommand: () => true,
      commandName: 'other',
      reply,
    } as unknown as Interaction;
    await handleInteraction(interaction, client, 'http://client');
    expect(reply).not.toHaveBeenCalled();
  });

  it('answers an unknown subcommand ephemerally rather than going silent', async () => {
    const client = mockClient();
    const { interaction, reply } = meetInteraction('bogus');
    await handleInteraction(interaction, client, 'http://client');
    const payload = reply.mock.calls[0][0];
    expect(payload.flags & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import type { Interaction } from 'discord.js';
import { handleInteraction, dispatchInteraction } from '../src/interactions.js';
import { DiscordIntegrationClient } from '../src/http/client.js';

function mockClient() {
  return {
    createLinkToken: vi.fn().mockResolvedValue({ token: 't', linkUrl: 'http://l' }),
    createRoom: vi.fn().mockResolvedValue({ roomId: 'r' }),
  } as unknown as DiscordIntegrationClient;
}

// Build a chat-input `/meet` interaction for the given subcommand. Includes the
// defer/edit/followUp trio the handlers use plus `reply` for the unknown-command
// fast path.
function meetInteraction(sub: string) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    isChatInputCommand: () => true,
    commandName: 'meet',
    options: { getSubcommand: () => sub },
    user: { id: '7', toString: () => '<@7>' },
    reply,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
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

describe('dispatchInteraction (top-level safety net)', () => {
  it('recovers a NOT-yet-deferred interaction with an ephemeral reply when routing throws', async () => {
    const client = mockClient();
    // deferReply rejects -> handleLink throws before the interaction is deferred.
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      isChatInputCommand: () => true,
      isRepliable: () => true,
      commandName: 'meet',
      options: { getSubcommand: () => 'link' },
      user: { id: '7', toString: () => '<@7>' },
      deferred: false,
      replied: false,
      deferReply: vi.fn().mockRejectedValue(new Error('defer failed')),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply,
    } as unknown as Interaction;

    await dispatchInteraction(interaction, client, 'http://client');
    const payload = reply.mock.calls[0][0];
    expect(payload.flags & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
  });

  it('recovers an ALREADY-deferred interaction via editReply (not reply) when routing throws', async () => {
    const client = mockClient();
    const reply = vi.fn();
    const editReply = vi
      .fn()
      .mockRejectedValueOnce(new Error('editReply failed')) // handler's own edit throws...
      .mockResolvedValue(undefined); // ...recovery edit succeeds.
    const interaction = {
      isChatInputCommand: () => true,
      isRepliable: () => true,
      commandName: 'meet',
      options: { getSubcommand: () => 'link' },
      user: { id: '7', toString: () => '<@7>' },
      deferred: true,
      replied: false,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply,
      reply,
    } as unknown as Interaction;

    // createLinkToken resolves, so the handler tries editReply (rejects) -> throws.
    await dispatchInteraction(interaction, client, 'http://client');
    // Recovery used editReply (deferred), never reply.
    expect(reply).not.toHaveBeenCalled();
    expect(editReply.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('swallows a failing recovery call without throwing', async () => {
    const client = mockClient();
    const interaction = {
      isChatInputCommand: () => true,
      isRepliable: () => true,
      commandName: 'meet',
      options: { getSubcommand: () => 'link' },
      user: { id: '7', toString: () => '<@7>' },
      deferred: true,
      replied: false,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockRejectedValue(new Error('always fails')),
      reply: vi.fn(),
    } as unknown as Interaction;

    // Must resolve, not reject, even though every editReply rejects.
    await expect(dispatchInteraction(interaction, client, 'http://client')).resolves.toBeUndefined();
  });

  it('ignores a non-repliable interaction after a routing error', async () => {
    const reply = vi.fn();
    const interaction = {
      isChatInputCommand: () => {
        throw new Error('boom');
      },
      isRepliable: () => false,
      reply,
    } as unknown as Interaction;

    await expect(dispatchInteraction(interaction, mockClient(), 'http://client')).resolves.toBeUndefined();
    expect(reply).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { handleLink, handleCreate, buildMeetingUrl } from '../src/commands/handlers.js';
import {
  DiscordIntegrationClient,
  NotLinkedError,
  IntegrationHttpError,
} from '../src/http/client.js';

const CLIENT_URL = 'http://client:5173';

// A mocked interaction exposing only what the handlers touch: the defer/edit/
// followUp trio and the invoking user. Cast at the call site so the handlers
// still see the real discord.js type.
function mockInteraction() {
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const followUp = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    user: { id: '42', toString: () => '<@42>' },
    deferReply,
    editReply,
    followUp,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, deferReply, editReply, followUp };
}

// True when a flags value carries the Ephemeral bit.
function hasEphemeral(flags: unknown): boolean {
  return typeof flags === 'number' && (flags & MessageFlags.Ephemeral) !== 0;
}

function mockClient(overrides: Partial<Record<'createLinkToken' | 'createRoom', ReturnType<typeof vi.fn>>> = {}) {
  return {
    createLinkToken: overrides.createLinkToken ?? vi.fn(),
    createRoom: overrides.createRoom ?? vi.fn(),
  } as unknown as DiscordIntegrationClient;
}

describe('handleLink', () => {
  it('defers ephemerally and edits in the link URL on success', async () => {
    const { interaction, deferReply, editReply, followUp } = mockInteraction();
    const createLinkToken = vi.fn().mockResolvedValue({
      token: 'jwt',
      linkUrl: 'http://client/link/discord?token=jwt',
    });
    await handleLink(interaction, mockClient({ createLinkToken }));

    expect(createLinkToken).toHaveBeenCalledWith('42');
    // Ephemeral routing: the deferred (and therefore edited) reply is ephemeral.
    expect(hasEphemeral(deferReply.mock.calls[0][0].flags)).toBe(true);
    expect(editReply.mock.calls[0][0].content).toContain('http://client/link/discord?token=jwt');
    // Never a public message for /meet link.
    expect(followUp).not.toHaveBeenCalled();
  });

  it('edits in a friendly ephemeral error when the token call fails', async () => {
    const { interaction, deferReply, editReply, followUp } = mockInteraction();
    const createLinkToken = vi.fn().mockRejectedValue(new IntegrationHttpError(500, 'boom'));
    await handleLink(interaction, mockClient({ createLinkToken }));

    expect(hasEphemeral(deferReply.mock.calls[0][0].flags)).toBe(true);
    expect(editReply.mock.calls[0][0].content).toMatch(/something went wrong/i);
    expect(followUp).not.toHaveBeenCalled();
  });
});

describe('handleCreate', () => {
  it('posts a PUBLIC embed via followUp and keeps the ack ephemeral on success', async () => {
    const { interaction, deferReply, editReply, followUp } = mockInteraction();
    const createRoom = vi.fn().mockResolvedValue({ roomId: 'abc-defg-hij' });
    await handleCreate(interaction, mockClient({ createRoom }), CLIENT_URL);

    expect(createRoom).toHaveBeenCalledWith('42');
    // The deferred ack is ephemeral (only the invoker sees it)...
    expect(hasEphemeral(deferReply.mock.calls[0][0].flags)).toBe(true);
    // ...but the meeting announcement is a PUBLIC followUp — no ephemeral flag.
    const followUpPayload = followUp.mock.calls[0][0];
    expect(hasEphemeral(followUpPayload.flags)).toBe(false);
    expect(followUpPayload.embeds).toHaveLength(1);
    const rendered = JSON.stringify(followUpPayload.embeds[0].data);
    expect(rendered).toContain('http://client:5173/lobby/abc-defg-hij');
    expect(rendered).toContain('<@42>');
    expect(editReply).toHaveBeenCalled();
  });

  it('edits in an ephemeral /meet link prompt when the account is not linked', async () => {
    const { interaction, deferReply, editReply, followUp } = mockInteraction();
    const createRoom = vi.fn().mockRejectedValue(new NotLinkedError());
    await handleCreate(interaction, mockClient({ createRoom }), CLIENT_URL);

    expect(hasEphemeral(deferReply.mock.calls[0][0].flags)).toBe(true);
    expect(editReply.mock.calls[0][0].content).toContain('/meet link');
    // No public message when not linked.
    expect(followUp).not.toHaveBeenCalled();
  });

  it('edits in a friendly ephemeral error on a server error (no public post)', async () => {
    const { interaction, editReply, followUp } = mockInteraction();
    const createRoom = vi.fn().mockRejectedValue(new IntegrationHttpError(500, 'boom'));
    await handleCreate(interaction, mockClient({ createRoom }), CLIENT_URL);

    expect(editReply.mock.calls[0][0].content).toMatch(/something went wrong/i);
    expect(followUp).not.toHaveBeenCalled();
  });

  it('edits in a friendly ephemeral error on a network failure (no public post)', async () => {
    const { interaction, editReply, followUp } = mockInteraction();
    const createRoom = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await handleCreate(interaction, mockClient({ createRoom }), CLIENT_URL);

    expect(editReply.mock.calls[0][0].content).toMatch(/something went wrong/i);
    expect(followUp).not.toHaveBeenCalled();
  });
});

describe('buildMeetingUrl', () => {
  it('builds the canonical /lobby/<roomId> join URL', () => {
    expect(buildMeetingUrl('http://client:5173', 'abc-defg-hij')).toBe(
      'http://client:5173/lobby/abc-defg-hij',
    );
  });

  it('tolerates a trailing slash on the client URL', () => {
    expect(buildMeetingUrl('http://client:5173/', 'x')).toBe('http://client:5173/lobby/x');
  });

  it('URL-encodes the room id', () => {
    expect(buildMeetingUrl('http://c', 'a b')).toBe('http://c/lobby/a%20b');
  });
});

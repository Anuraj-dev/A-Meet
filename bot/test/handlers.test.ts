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

// A mocked interaction exposing only what the handlers touch. Cast at the call
// site so the handlers still see the real discord.js type.
function mockInteraction() {
  const reply = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    user: { id: '42', toString: () => '<@42>' },
    reply,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, reply };
}

// A mocked HTTP client — only the two methods the handlers call.
function mockClient(overrides: Partial<Record<'createLinkToken' | 'createRoom', ReturnType<typeof vi.fn>>> = {}) {
  return {
    createLinkToken: overrides.createLinkToken ?? vi.fn(),
    createRoom: overrides.createRoom ?? vi.fn(),
  } as unknown as DiscordIntegrationClient;
}

function isEphemeral(flags: unknown): boolean {
  return typeof flags === 'number' && (flags & MessageFlags.Ephemeral) !== 0;
}

describe('handleLink', () => {
  it('replies ephemerally with the link URL on success', async () => {
    const { interaction, reply } = mockInteraction();
    const createLinkToken = vi.fn().mockResolvedValue({
      token: 'jwt',
      linkUrl: 'http://client/link/discord?token=jwt',
    });
    await handleLink(interaction, mockClient({ createLinkToken }));

    expect(createLinkToken).toHaveBeenCalledWith('42');
    const payload = reply.mock.calls[0][0];
    expect(isEphemeral(payload.flags)).toBe(true);
    expect(payload.content).toContain('http://client/link/discord?token=jwt');
  });

  it('replies ephemerally with a friendly error when the token call fails', async () => {
    const { interaction, reply } = mockInteraction();
    const createLinkToken = vi.fn().mockRejectedValue(new IntegrationHttpError(500, 'boom'));
    await handleLink(interaction, mockClient({ createLinkToken }));

    const payload = reply.mock.calls[0][0];
    expect(isEphemeral(payload.flags)).toBe(true);
    expect(payload.content).toMatch(/something went wrong/i);
    expect(payload.embeds).toBeUndefined();
  });
});

describe('handleCreate', () => {
  it('posts a PUBLIC embed with the meeting URL and starter on success', async () => {
    const { interaction, reply } = mockInteraction();
    const createRoom = vi.fn().mockResolvedValue({ roomId: 'abc-defg-hij' });
    await handleCreate(interaction, mockClient({ createRoom }), CLIENT_URL);

    expect(createRoom).toHaveBeenCalledWith('42');
    const payload = reply.mock.calls[0][0];
    // Public: no ephemeral flag.
    expect(isEphemeral(payload.flags)).toBe(false);
    expect(payload.embeds).toHaveLength(1);
    const data = payload.embeds[0].data;
    const rendered = JSON.stringify(data);
    expect(rendered).toContain('http://client:5173/lobby/abc-defg-hij');
    expect(rendered).toContain('<@42>');
  });

  it('replies ephemerally prompting /meet link when the account is not linked', async () => {
    const { interaction, reply } = mockInteraction();
    const createRoom = vi.fn().mockRejectedValue(new NotLinkedError());
    await handleCreate(interaction, mockClient({ createRoom }), CLIENT_URL);

    const payload = reply.mock.calls[0][0];
    expect(isEphemeral(payload.flags)).toBe(true);
    expect(payload.content).toContain('/meet link');
    expect(payload.embeds).toBeUndefined();
  });

  it('replies ephemerally with a friendly error on a server error', async () => {
    const { interaction, reply } = mockInteraction();
    const createRoom = vi.fn().mockRejectedValue(new IntegrationHttpError(500, 'boom'));
    await handleCreate(interaction, mockClient({ createRoom }), CLIENT_URL);

    const payload = reply.mock.calls[0][0];
    expect(isEphemeral(payload.flags)).toBe(true);
    expect(payload.content).toMatch(/something went wrong/i);
    expect(payload.embeds).toBeUndefined();
  });

  it('replies ephemerally with a friendly error on a network failure', async () => {
    const { interaction, reply } = mockInteraction();
    const createRoom = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await handleCreate(interaction, mockClient({ createRoom }), CLIENT_URL);

    const payload = reply.mock.calls[0][0];
    expect(isEphemeral(payload.flags)).toBe(true);
    expect(payload.embeds).toBeUndefined();
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

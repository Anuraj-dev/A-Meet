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

// True when a flags value carries the Ephemeral marker in any of the forms
// discord.js accepts: the numeric bit, the 'Ephemeral' string, or an array of
// either.
function carriesEphemeral(flags: unknown): boolean {
  if (typeof flags === 'number') return (flags & MessageFlags.Ephemeral) !== 0;
  if (typeof flags === 'string') return flags === 'Ephemeral';
  if (Array.isArray(flags)) return flags.some(carriesEphemeral);
  return false;
}

// True when the deferred reply was created ephemeral.
function hasEphemeral(flags: unknown): boolean {
  return carriesEphemeral(flags);
}

// A reply payload is PUBLIC only if it carries the Ephemeral marker in NO form
// and does not use the (deprecated but still honored) `ephemeral: true` shorthand.
function isPublic(payload: { flags?: unknown; ephemeral?: unknown }): boolean {
  return !carriesEphemeral(payload.flags) && payload.ephemeral !== true;
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
    // ...but the meeting announcement is a PUBLIC followUp — neither the
    // ephemeral flag bit nor the deprecated `ephemeral: true` shorthand.
    const followUpPayload = followUp.mock.calls[0][0];
    expect(isPublic(followUpPayload)).toBe(true);
    expect(followUpPayload.embeds).toHaveLength(1);
    const rendered = JSON.stringify(followUpPayload.embeds[0].data);
    expect(rendered).toContain('http://client:5173/lobby/abc-defg-hij');
    expect(rendered).toContain('<@42>');
    expect(editReply).toHaveBeenCalled();
  });

  it('resolves the deferred reply with the link when the public post fails', async () => {
    const { interaction, deferReply, editReply, followUp } = mockInteraction();
    const createRoom = vi.fn().mockResolvedValue({ roomId: 'abc-defg-hij' });
    // Channel post rejects (e.g. the bot lacks Send Messages there).
    (followUp as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Missing Permissions'),
    );
    await handleCreate(interaction, mockClient({ createRoom }), CLIENT_URL);

    // The invoker is NOT left hanging: the ephemeral deferred reply is resolved
    // with the meeting link so the created room isn't wasted.
    expect(hasEphemeral(deferReply.mock.calls[0][0].flags)).toBe(true);
    const editPayload = editReply.mock.calls.at(-1)![0];
    expect(editPayload.content).toContain('http://client:5173/lobby/abc-defg-hij');
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

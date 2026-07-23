import { describe, it, expect } from 'vitest';
import { InteractionContextType } from 'discord.js';
import { meetCommandJSON } from '../src/commands/meet.js';

describe('meet command definition', () => {
  it('is named /meet with link and create subcommands', () => {
    expect(meetCommandJSON.name).toBe('meet');
    const subNames = (meetCommandJSON.options ?? []).map((o) => o.name).sort();
    expect(subNames).toEqual(['create', 'link']);
  });

  it('is guild-only — never available in DMs', () => {
    // /meet create must post a PUBLIC channel embed; in a DM the "public" post
    // is just the DM itself, silently violating the spec. Guild-only contexts
    // make the command uninvokable outside servers.
    expect(meetCommandJSON.contexts).toEqual([InteractionContextType.Guild]);
  });
});

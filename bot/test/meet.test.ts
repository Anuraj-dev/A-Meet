import { describe, it, expect } from 'vitest';
import { meetCommandJSON } from '../src/commands/meet.js';

describe('meet command definition', () => {
  it('is named /meet with link and create subcommands', () => {
    expect(meetCommandJSON.name).toBe('meet');
    const subNames = (meetCommandJSON.options ?? []).map((o) => o.name).sort();
    expect(subNames).toEqual(['create', 'link']);
  });
});

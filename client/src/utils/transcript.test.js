import { describe, expect, it } from 'vitest';
import { formatTranscript, mergeTranscriptEntries } from './transcript';

describe('transcript utilities', () => {
  it('merges snapshots and live entries into canonical server order', () => {
    const first = { id: 'room:1', sequence: 1, text: 'First' };
    const second = { id: 'room:2', sequence: 2, text: 'Second' };
    expect(mergeTranscriptEntries([second], [first, second])).toEqual([first, second]);
  });

  it('formats speaker-labelled plain text for download', () => {
    const output = formatTranscript({
      roomId: 'abc-defg-hij',
      meetingTitle: 'Design review',
      entries: [{
        id: 'room:1', sequence: 1, ts: new Date('2026-06-20T10:00:00Z').getTime(),
        speaker: { name: 'Raja' }, text: 'Ship the transcript.',
      }],
    });
    expect(output).toContain('Design review');
    expect(output).toContain('Raja: Ship the transcript.');
  });
});

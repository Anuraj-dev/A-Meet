import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTranscript, formatTranscript, mergeTranscriptEntries } from './transcript';

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

  it('leaves the transcript file readable until the browser can start the download', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:transcript');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function mockClick() {
      expect(document.body.contains(this)).toBe(true);
      expect(this.download).toBe('a-meet-abc-defg-hij-transcript.txt');
      expect(this.href).toContain('blob:transcript');
      expect(revokeObjectURL).not.toHaveBeenCalled();
    });

    downloadTranscript({
      roomId: 'abc-defg-hij',
      entries: [],
    });

    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:transcript');
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

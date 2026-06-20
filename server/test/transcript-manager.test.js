import { afterEach, describe, expect, it } from 'vitest';
import {
  appendTranscriptSegment,
  clearTranscript,
  getTranscriptSnapshot,
  reviseTranscriptSegment,
  startTranscript,
  stopTranscript,
} from '../src/socket/transcript-manager.js';

const roomId = 'transcript-room';
const user = { id: 'user-1', name: 'Raja', avatar: 'avatar.png' };

afterEach(() => clearTranscript(roomId));

describe('transcript manager', () => {
  it('creates one canonical ordered transcript', () => {
    startTranscript(roomId, user, 1000);
    const first = appendTranscriptSegment(roomId, user, {
      clientSegmentId: 'segment-1', text: '  Hello   everyone  ',
    }, 1100);
    const second = appendTranscriptSegment(roomId, { ...user, id: 'user-2', name: 'Guest' }, {
      clientSegmentId: 'segment-2', text: 'Hi Raja',
    }, 1200);

    expect(first.entry).toMatchObject({ sequence: 1, text: 'Hello everyone', ts: 1100 });
    expect(second.entry).toMatchObject({ sequence: 2, speaker: { name: 'Guest' } });
    expect(getTranscriptSnapshot(roomId).entries).toEqual([first.entry, second.entry]);
  });

  it('rejects segments while the shared transcript is stopped', () => {
    expect(appendTranscriptSegment(roomId, user, {
      clientSegmentId: 'segment-1', text: 'Hello',
    })).toEqual({ error: 'Transcript is not active' });
  });

  it('deduplicates provider retries but preserves legitimately repeated speech', () => {
    startTranscript(roomId, user, 1000);
    appendTranscriptSegment(roomId, user, { clientSegmentId: 'segment-1', text: 'Hello' }, 1100);
    expect(appendTranscriptSegment(roomId, user, {
      clientSegmentId: 'segment-1', text: 'Hello',
    }, 1200)).toEqual({ duplicate: true });
    expect(appendTranscriptSegment(roomId, user, {
      clientSegmentId: 'segment-2', text: 'hello',
    }, 1300).entry).toMatchObject({ sequence: 2, text: 'hello' });
    expect(getTranscriptSnapshot(roomId).entries).toHaveLength(2);
  });

  it('revises a provisional provider segment without changing its canonical order', () => {
    startTranscript(roomId, user, 1000);
    const provisional = appendTranscriptSegment(roomId, user, {
      clientSegmentId: 'stream-1', text: 'A meat', provider: 'deepgram', provisional: true,
    }, 1100).entry;
    const revised = reviseTranscriptSegment(roomId, provisional.id, 'A Meet', {
      provider: 'deepgram+groq',
    }, 1400);

    expect(revised).toMatchObject({
      id: provisional.id, sequence: 1, text: 'A Meet', provisional: false,
      provider: 'deepgram+groq', revisedAt: 1400,
    });
    expect(getTranscriptSnapshot(roomId).entries).toEqual([revised]);
  });

  it('preserves entries when the host stops transcription', () => {
    startTranscript(roomId, user, 1000);
    appendTranscriptSegment(roomId, user, { clientSegmentId: 'segment-1', text: 'Keep this' }, 1100);
    const state = stopTranscript(roomId, 2000);

    expect(state).toMatchObject({ active: false, stoppedAt: 2000 });
    expect(getTranscriptSnapshot(roomId).entries[0].text).toBe('Keep this');
  });
});

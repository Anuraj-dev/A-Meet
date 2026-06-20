import { describe, expect, it, vi } from 'vitest';
import { DeepgramMeetingSession } from '../src/transcription/deepgram-session.js';

describe('DeepgramMeetingSession turn assembly', () => {
  it('broadcasts interim text and finalizes one audio-backed utterance', () => {
    const onInterim = vi.fn();
    const onFinal = vi.fn();
    const session = new DeepgramMeetingSession({
      socketId: 'socket-1',
      onInterim,
      onFinal,
      onStatus: vi.fn(),
    });
    const preRoll = Buffer.alloc(3200, 1);
    const speech = Buffer.alloc(3200, 2);
    session.send(preRoll);
    session.beginSpeech();
    session.send(speech);

    session.handleTranscript({
      is_final: false,
      speech_final: false,
      channel: { alternatives: [{ transcript: 'A Meet is' }] },
    });
    expect(onInterim).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'A Meet is' }));

    session.handleTranscript({
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: 'A Meet is working.' }] },
    });
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({
      text: 'A Meet is working.',
      audio: Buffer.concat([preRoll, speech]),
    }));
    expect(onInterim).toHaveBeenLastCalledWith(expect.objectContaining({ text: '' }));
  });

  it('uses unique utterance ids across capture sessions', () => {
    const create = () => new DeepgramMeetingSession({
      socketId: 'same-socket', onInterim: vi.fn(), onFinal: vi.fn(), onStatus: vi.fn(),
    });
    expect(create().utteranceId).not.toBe(create().utteranceId);
  });
});

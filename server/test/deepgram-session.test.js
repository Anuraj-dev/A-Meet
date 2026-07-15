import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deepgramHandlers, mockConnection, mockConnect } = vi.hoisted(() => {
  const handlers = {};
  const connection = {
    on: vi.fn((event, callback) => { handlers[event] = callback; }),
    connect: vi.fn(),
    sendMedia: vi.fn(),
    sendFinalize: vi.fn(),
    sendCloseStream: vi.fn(),
    close: vi.fn(),
  };
  return {
    deepgramHandlers: handlers,
    mockConnection: connection,
    mockConnect: vi.fn().mockResolvedValue(connection),
  };
});

vi.mock('@deepgram/sdk', () => ({
  DeepgramClient: class {
    listen = { v1: { connect: mockConnect } };
  },
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    transcription: {
      deepgramApiKey: 'test-key',
      groqApiKey: '',
      deepgramModel: 'nova-3',
    },
  },
}));

vi.mock('../src/config/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import { DeepgramMeetingSession } from '../src/transcription/deepgram-session.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(deepgramHandlers)) delete deepgramHandlers[key];
  mockConnect.mockResolvedValue(mockConnection);
});

describe('DeepgramMeetingSession provider lifecycle', () => {
  it('closes a connection created after stop without connecting it', async () => {
    let resolveConnection;
    mockConnect.mockReturnValueOnce(new Promise((resolve) => {
      resolveConnection = resolve;
    }));
    const session = new DeepgramMeetingSession({
      socketId: 'socket-stopped-while-connecting',
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onStatus: vi.fn(),
    });

    const starting = session.start();
    await session.stop();
    resolveConnection(mockConnection);
    await starting;

    expect(mockConnection.close).toHaveBeenCalledTimes(1);
    expect(mockConnection.connect).not.toHaveBeenCalled();
  });

  it('uses the v5 live API and flushes buffered audio after open', async () => {
    const onStatus = vi.fn();
    const session = new DeepgramMeetingSession({
      socketId: 'socket-v5',
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onStatus,
    });
    const buffered = Buffer.alloc(320, 3);
    session.send(buffered);

    await session.start();

    expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
      model: 'nova-3',
      encoding: 'linear16',
      sample_rate: 16000,
      interim_results: 'true',
    }));
    expect(mockConnection.connect).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith({ status: 'connecting', provider: 'Deepgram' });

    deepgramHandlers.open();
    expect(mockConnection.sendMedia).toHaveBeenCalledWith(buffered);
    expect(onStatus).toHaveBeenLastCalledWith({ status: 'listening', provider: 'Deepgram' });
  });

  it('closes a never-opened connection without sending finalize messages', async () => {
    const session = new DeepgramMeetingSession({
      socketId: 'socket-never-opened',
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onStatus: vi.fn(),
    });
    await session.start();

    await session.stop();

    expect(mockConnection.sendFinalize).not.toHaveBeenCalled();
    expect(mockConnection.sendCloseStream).not.toHaveBeenCalled();
    expect(mockConnection.close).toHaveBeenCalledTimes(1);
  });

  it('maps v5 message types and closes with finalize then close-stream', async () => {
    vi.useFakeTimers();
    const onFinal = vi.fn();
    const session = new DeepgramMeetingSession({
      socketId: 'socket-v5',
      onInterim: vi.fn(),
      onFinal,
      onStatus: vi.fn(),
    });
    await session.start();
    deepgramHandlers.open();

    deepgramHandlers.message({ type: 'SpeechStarted', channel: [0], timestamp: 0 });
    deepgramHandlers.message({
      type: 'Results',
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: 'Migrated safely.' }] },
    });
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ text: 'Migrated safely.' }));

    const stopping = session.stop();
    expect(mockConnection.sendFinalize).toHaveBeenCalledWith({ type: 'Finalize' });
    await vi.advanceTimersByTimeAsync(450);
    await stopping;
    expect(mockConnection.sendCloseStream).toHaveBeenCalledWith({ type: 'CloseStream' });
    expect(mockConnection.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

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

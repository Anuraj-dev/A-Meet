import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePcmCapture } from './usePcmCapture';

const originals = {
  AudioContext: window.AudioContext,
  AudioWorkletNode: window.AudioWorkletNode,
  MediaStream: globalThis.MediaStream,
};

afterEach(() => {
  window.AudioContext = originals.AudioContext;
  window.AudioWorkletNode = originals.AudioWorkletNode;
  globalThis.AudioWorkletNode = originals.AudioWorkletNode;
  globalThis.MediaStream = originals.MediaStream;
  vi.restoreAllMocks();
});

describe('usePcmCapture', () => {
  it('streams worklet PCM buffers without storing audio in React state', async () => {
    let processor;
    const source = { connect: vi.fn((node) => node), disconnect: vi.fn() };
    const sink = { disconnect: vi.fn() };
    class MockAudioWorkletNode {
      constructor() {
        this.port = { onmessage: null, close: vi.fn() };
        this.connect = vi.fn(() => sink);
        this.disconnect = vi.fn();
        processor = this;
      }
    }
    class MockAudioContext {
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      createMediaStreamSource = vi.fn(() => source);
      createMediaStreamDestination = vi.fn(() => sink);
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
    }
    class MockMediaStream { constructor(tracks) { this.tracks = tracks; } }
    window.AudioContext = MockAudioContext;
    window.AudioWorkletNode = MockAudioWorkletNode;
    globalThis.AudioWorkletNode = MockAudioWorkletNode;
    globalThis.MediaStream = MockMediaStream;
    const onChunk = vi.fn();
    const { result } = renderHook(() => usePcmCapture({
      enabled: true,
      audioTrack: { readyState: 'live' },
      onChunk,
    }));

    await waitFor(() => expect(result.current.status).toBe('streaming'));
    const audio = new ArrayBuffer(3200);
    act(() => processor.port.onmessage({ data: audio }));
    expect(onChunk).toHaveBeenCalledWith(audio);
  });

  it('reports unsupported when AudioWorklet is unavailable', () => {
    window.AudioWorkletNode = undefined;
    globalThis.AudioWorkletNode = undefined;
    const { result } = renderHook(() => usePcmCapture({
      enabled: true, audioTrack: { readyState: 'live' }, onChunk: vi.fn(),
    }));
    expect(result.current.status).toBe('unsupported');
  });
});

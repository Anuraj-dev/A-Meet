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
    let processor: { port: { onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null; close: ReturnType<typeof vi.fn> } } | undefined;
    const source = { connect: vi.fn((node) => node), disconnect: vi.fn() };
    const sink = { disconnect: vi.fn() };
    class MockAudioWorkletNode {
      port: { onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null; close: ReturnType<typeof vi.fn> };
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;

      constructor() {
        this.port = { onmessage: null, close: vi.fn() };
        this.connect = vi.fn(() => sink);
        this.disconnect = vi.fn();
        processor = { port: this.port };
      }
    }
    class MockAudioContext {
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      createMediaStreamSource = vi.fn(() => source);
      createMediaStreamDestination = vi.fn(() => sink);
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
    }
    class MockMediaStream {
      tracks: MediaStreamTrack[];
      constructor(tracks: MediaStreamTrack[]) { this.tracks = tracks; }
    }
    window.AudioContext = MockAudioContext as unknown as typeof AudioContext;
    window.AudioWorkletNode = MockAudioWorkletNode as unknown as typeof AudioWorkletNode;
    globalThis.AudioWorkletNode = MockAudioWorkletNode as unknown as typeof AudioWorkletNode;
    globalThis.MediaStream = MockMediaStream as unknown as typeof MediaStream;
    const onChunk = vi.fn();
    const { result } = renderHook(() => usePcmCapture({
      enabled: true,
      audioTrack: { readyState: 'live' } as MediaStreamTrack,
      onChunk,
    }));

    await waitFor(() => expect(result.current.status).toBe('streaming'));
    const audio = new ArrayBuffer(3200);
    act(() => processor?.port.onmessage?.({ data: audio } as MessageEvent<ArrayBuffer>));
    expect(onChunk).toHaveBeenCalledWith(audio);
  });

  it('reports unsupported when AudioWorklet is unavailable', () => {
    window.AudioWorkletNode = undefined as unknown as typeof AudioWorkletNode;
    globalThis.AudioWorkletNode = undefined as unknown as typeof AudioWorkletNode;
    const { result } = renderHook(() => usePcmCapture({
      enabled: true, audioTrack: { readyState: 'live' } as MediaStreamTrack, onChunk: vi.fn(),
    }));
    expect(result.current.status).toBe('unsupported');
  });
});

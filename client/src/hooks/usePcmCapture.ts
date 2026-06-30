import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

interface PcmCaptureOptions {
  enabled: boolean;
  audioTrack: MediaStreamTrack | null;
  onChunk?: (chunk: ArrayBuffer) => void;
}

export function isPcmCaptureSupported(): boolean {
  return typeof window !== 'undefined'
    && !!(window.AudioContext || window.webkitAudioContext)
    && typeof window.AudioWorkletNode === 'function';
}

export function usePcmCapture({ enabled, audioTrack, onChunk }: PcmCaptureOptions) {
  const supported = isPcmCaptureSupported();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const onChunkRef = useRef(onChunk);
  useEffect(() => { onChunkRef.current = onChunk; }, [onChunk]);

  useEffect(() => {
    if (!enabled || !audioTrack || audioTrack.readyState !== 'live' || !supported) return undefined;
    let cancelled = false;
    let context: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let processor: AudioWorkletNode | undefined;
    let sink: MediaStreamAudioDestinationNode | undefined;
    const track = audioTrack;

    async function start() {
      try {
        setStatus('preparing');
        setError('');
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('AudioContext is unavailable.');
        // Let Chromium's native resampler produce provider-ready 16 kHz audio;
        // the worklet still handles other rates if a browser ignores this hint.
        context = new AudioContextClass({ latencyHint: 'interactive', sampleRate: 16000 });
        await context.audioWorklet.addModule('/pcm-capture-worklet.js');
        if (cancelled) return;
        source = context.createMediaStreamSource(new MediaStream([track]));
        processor = new AudioWorkletNode(context, 'ameet-pcm-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        // Pull the worklet through a MediaStream sink, never the physical
        // speakers. This avoids feedback and keeps capture independent of headphones.
        sink = context.createMediaStreamDestination();
        processor.port.onmessage = (event) => {
          if (!cancelled && event.data instanceof ArrayBuffer) onChunkRef.current?.(event.data);
        };
        source.connect(processor).connect(sink);
        await context.resume();
        if (!cancelled) setStatus('streaming');
      } catch (cause: unknown) {
        if (!cancelled) {
          setStatus('error');
          setError(cause instanceof Error && cause.message
            ? cause.message
            : 'Could not capture microphone audio for transcription.');
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      try { processor?.port.close(); } catch { /* already closed */ }
      try { source?.disconnect(); } catch { /* already disconnected */ }
      try { processor?.disconnect(); } catch { /* already disconnected */ }
      try { sink?.disconnect(); } catch { /* already disconnected */ }
      Promise.resolve(context?.close()).catch(() => {});
    };
  }, [enabled, audioTrack, supported]);

  return {
    supported,
    status: !supported ? 'unsupported' : !enabled ? 'idle' : !audioTrack ? 'paused' : status,
    error: !supported ? 'Live transcription requires AudioWorklet support.' : error,
  };
}

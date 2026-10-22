import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RemoteAudio from './RemoteAudio';

// Each PeerAudio builds its own AudioContext graph: source → gain → destination.
// Record which streams got a graph and at what gain.
const graphs: Array<{ stream: MediaStream; gain: { value: number } }> = [];

class FakeAudioContext {
  state = 'running';
  destination = {};
  createMediaStreamSource(stream: MediaStream) {
    const graph = { stream, gain: { value: 1 } };
    graphs.push(graph);
    return { connect: vi.fn(), disconnect: vi.fn(), graph };
  }
  createGain() {
    const graph = graphs[graphs.length - 1];
    return { gain: graph.gain, connect: vi.fn(), disconnect: vi.fn() };
  }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

function fakeStream(kinds: Array<'audio' | 'video'>): MediaStream {
  const tracks = kinds.map((kind) => ({ kind }));
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  } as unknown as MediaStream;
}

const originalAudioContext = window.AudioContext;
beforeEach(() => {
  graphs.length = 0;
  window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
});
afterEach(() => { window.AudioContext = originalAudioContext; });

describe('RemoteAudio', () => {
  it('plays a shared screen\'s audio alongside the peer\'s mic', () => {
    const mic = fakeStream(['audio', 'video']);
    const screen = fakeStream(['video', 'audio']);

    render(<RemoteAudio streams={{ 'peer-1': mic }} screenStreams={{ 'peer-1': screen }} />);

    expect(graphs.map((g) => g.stream)).toEqual([mic, screen]);
  });

  it('skips a screen share that carries no audio', () => {
    render(<RemoteAudio streams={{}} screenStreams={{ 'peer-1': fakeStream(['video']) }} />);

    expect(graphs).toHaveLength(0);
  });

  it('plays shared audio at the master volume, not the peer\'s mic override', () => {
    const screen = fakeStream(['video', 'audio']);

    render(
      <RemoteAudio
        streams={{ 'peer-1': fakeStream(['audio']) }}
        screenStreams={{ 'peer-1': screen }}
        masterVolume={0.5}
        peerVolumes={{ 'peer-1': 0 }}
      />,
    );

    const [micGraph, screenGraph] = graphs;
    expect(micGraph.gain.value).toBe(0);
    expect(screenGraph.stream).toBe(screen);
    expect(screenGraph.gain.value).toBe(0.5);
  });
});

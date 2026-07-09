/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared fakes for the SFU client surface — a controllable socket, a stubbed
// `request()` signaling layer, and a mediasoup-client `Device` whose transports
// record produce/consume calls. Hoisted so the vi.mock factories can close over
// them, and inspected from the tests.
const H = vi.hoisted(() => {
  const handlers: Record<string, Array<(payload: any) => void>> = {};
  const socket = {
    connected: false,
    id: 'local-socket-id',
    on: vi.fn((event: string, cb: (payload: any) => void) => { (handlers[event] ||= []).push(cb); }),
    off: vi.fn((event: string, cb: (payload: any) => void) => { if (handlers[event]) handlers[event] = handlers[event].filter((h) => h !== cb); }),
    emit: vi.fn(),
    connect: vi.fn(() => { socket.connected = true; }),
    disconnect: vi.fn(() => { socket.connected = false; }),
    _handlers: handlers,
    // Push an incoming server event to the hook's registered listeners.
    _emit(event: string, payload: any) { (handlers[event] || []).slice().forEach((cb) => cb(payload)); },
  };

  const state: any = {
    socket,
    request: vi.fn(),
    devices: [],
    sendTransports: [],
    recvTransports: [],
    produced: [],   // appData of each transport.produce()
    consumed: [],   // each fake consumer created
    producerKinds: {}, // producerId → kind, for sfu-consume responses
    existingProducers: [],
    pid: 0,
  };

  function makeProducer(appData: any) {
    return {
      id: `producer-${appData?.mediaTag ?? appData?.source ?? 'x'}-${++state.pid}`,
      appData, paused: false,
      on: vi.fn(), pause: vi.fn(), resume: vi.fn(), close: vi.fn(),
    };
  }
  function makeConsumer(id: string, producerId: string, kind: string) {
    return {
      id, producerId, kind,
      track: { kind, id: `track-${id}`, stop: vi.fn() },
      close: vi.fn(),
      getStats: vi.fn(async () => new Map()),
    };
  }
  function makeTransport(direction: string, params: any) {
    const listeners: Record<string, (...args: any[]) => void> = {};
    return {
      id: params?.id ?? `${direction}-transport`,
      direction,
      connectionState: 'new',
      on: vi.fn((event: string, cb: (...args: any[]) => void) => { listeners[event] = cb; }),
      produce: vi.fn(async ({ track, appData }: any) => { state.produced.push({ appData, track }); return makeProducer(appData); }),
      consume: vi.fn(async ({ id, producerId, kind }: any) => { const c = makeConsumer(id, producerId, kind); state.consumed.push(c); return c; }),
      close: vi.fn(),
      _listeners: listeners,
    };
  }
  function makeDevice() {
    const device = {
      rtpCapabilities: { codecs: [], headerExtensions: [] },
      load: vi.fn(async () => {}),
      canProduce: vi.fn(() => true),
      createSendTransport: vi.fn((params: any) => { const t = makeTransport('send', params); state.sendTransports.push(t); return t; }),
      createRecvTransport: vi.fn((params: any) => { const t = makeTransport('recv', params); state.recvTransports.push(t); return t; }),
    };
    state.devices.push(device);
    return device;
  }
  state.Device = vi.fn(() => makeDevice());
  return state;
});

vi.mock('mediasoup-client', () => ({ Device: H.Device }));
vi.mock('../services/socket', () => ({ default: H.socket }));
vi.mock('../services/mediasoup-signal', () => ({ request: H.request }));

import { useMediasoup } from './useMediasoup';

// ── Browser-media globals (jsdom has none) ──────────────────────────────────
class FakeMediaStream {
  _tracks: any[];
  constructor(tracks: any[] = []) { this._tracks = [...tracks]; }
  addTrack(t: any) { this._tracks.push(t); }
  removeTrack(t: any) { this._tracks = this._tracks.filter((x) => x !== t); }
  getTracks() { return this._tracks; }
  getVideoTracks() { return this._tracks.filter((t) => t.kind === 'video'); }
  getAudioTracks() { return this._tracks.filter((t) => t.kind === 'audio'); }
}
function fakeTrack(kind: string, deviceId: string) {
  return { kind, enabled: true, stop: vi.fn(), addEventListener: vi.fn(), getSettings: () => ({ deviceId, sampleRate: 48000 }) };
}
class FakeAudioContext {
  state: AudioContextState;
  sampleRate: number;
  constructor() { this.state = 'running'; this.sampleRate = 48000; }
  createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createMediaStreamDestination() { return { stream: new FakeMediaStream([fakeTrack('audio', 'mic-dest')]), disconnect: vi.fn() }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

const originals = { MediaStream: globalThis.MediaStream, AudioContext: window.AudioContext };

function defaultResponder(event: string, data: any) {
  switch (event) {
    case 'sfu-get-rtp-capabilities': return { rtpCapabilities: { codecs: [], headerExtensions: [] } };
    case 'sfu-create-transport': return { id: `${data.direction}-transport`, iceParameters: {}, iceCandidates: [], dtlsParameters: {} };
    case 'sfu-produce': return { id: `producer-${data.appData?.mediaTag ?? 'x'}` };
    case 'sfu-get-producers': return H.existingProducers;
    case 'sfu-consume': return {
      id: `consumer-${data.producerId}`, producerId: data.producerId,
      kind: H.producerKinds[data.producerId] ?? 'audio', rtpParameters: {}, producerPaused: false,
    };
    default: return {};
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset recorded SFU state between tests.
  H.devices.length = 0; H.sendTransports.length = 0; H.recvTransports.length = 0;
  H.produced.length = 0; H.consumed.length = 0; H.pid = 0;
  H.producerKinds = {}; H.existingProducers = [];
  Object.keys(H.socket._handlers).forEach((k) => delete H.socket._handlers[k]);
  H.socket.connected = false;
  H.request.mockImplementation(async (event: string, data: any) => defaultResponder(event, data));

  globalThis.MediaStream = FakeMediaStream as unknown as typeof MediaStream;
  window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => {
      if (constraints.audio) return new FakeMediaStream([fakeTrack('audio', 'mic-1')]);
      if (constraints.video) return new FakeMediaStream([fakeTrack('video', 'cam-1')]);
      return new FakeMediaStream([]);
    }),
    getDisplayMedia: vi.fn(),
  } });
});

afterEach(() => {
  globalThis.MediaStream = originals.MediaStream;
  window.AudioContext = originals.AudioContext;
});

function mount(devices: { startAudioOn?: boolean; startVideoOn?: boolean; audioDeviceId?: string; videoDeviceId?: string } = { startAudioOn: true, startVideoOn: true }) {
  return renderHook(() => useMediasoup('room-1', devices));
}

// Wait until the initial SFU setup has run its full signaling sequence (the last
// request in setupSfu is sfu-get-producers), then flush the trailing microtasks
// so initializedRef is set before any reconnect.
async function waitForSetup() {
  await waitFor(() => expect(H.request).toHaveBeenCalledWith('sfu-get-producers'));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

// Bring one remote peer into the call by announcing its producer.
async function consumePeer(result: any, { producerId = 'p-remote-1', socketId = 'peer-1', kind = 'video', user }: any = {}) {
  H.producerKinds[producerId] = kind;
  await act(async () => {
    H.socket._emit('sfu-new-producer', {
      producerId, socketId, user: user ?? { name: 'Remote One', avatar: 'r.png' },
      kind, paused: false, appData: { source: 'camera' },
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current.remoteStreams[socketId]).toBeDefined());
}

describe('useMediasoup', () => {
  it('runs the SFU join sequence and produces the local mic + camera tracks', async () => {
    const { result } = mount();

    await waitFor(() => expect(result.current.localAudioOn).toBe(true));
    expect(result.current.localVideoOn).toBe(true);
    expect(result.current.hasMic).toBe(true);
    expect(result.current.hasCamera).toBe(true);

    // Signaling sequence: capabilities → device load → send transport → produce.
    expect(H.request).toHaveBeenCalledWith('sfu-get-rtp-capabilities', { roomId: 'room-1' });
    expect(H.devices).toHaveLength(1);
    expect(H.devices[0].load).toHaveBeenCalledWith({ routerRtpCapabilities: { codecs: [], headerExtensions: [] } });
    expect(H.sendTransports).toHaveLength(1);
    const producedTags = H.produced.map((p: any) => p.appData?.mediaTag);
    expect(producedTags).toContain('audio');
    expect(producedTags).toContain('video');
  });

  it('consumes an incoming sfu-new-producer and exposes the remote peer', async () => {
    const { result } = mount();
    await waitForSetup();

    await consumePeer(result, { socketId: 'peer-1', kind: 'video' });

    expect(H.request).toHaveBeenCalledWith(
      'sfu-consume',
      expect.objectContaining({ producerId: 'p-remote-1', transportId: 'recv-transport' }),
    );
    expect(result.current.remoteStreams['peer-1']).toBeInstanceOf(FakeMediaStream);
    expect(result.current.peerStates['peer-1']).toMatchObject({ name: 'Remote One' });
  });

  it('tears the peer down on sfu-peer-left', async () => {
    const { result } = mount();
    await waitForSetup();
    await consumePeer(result, { socketId: 'peer-1' });

    await act(async () => { H.socket._emit('sfu-peer-left', { socketId: 'peer-1' }); await Promise.resolve(); });

    await waitFor(() => expect(result.current.remoteStreams['peer-1']).toBeUndefined());
    expect(result.current.peerStates['peer-1']).toBeUndefined();
  });

  it('closes the consumer (and drops the peer) on sfu-consumer-closed', async () => {
    const { result } = mount();
    await waitForSetup();
    await consumePeer(result, { producerId: 'p-remote-1', socketId: 'peer-1' });

    await act(async () => {
      H.socket._emit('sfu-consumer-closed', { consumerId: 'consumer-p-remote-1' });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.remoteStreams['peer-1']).toBeUndefined());
  });

  it('re-runs SFU setup and re-asserts a raised hand on socket reconnect', async () => {
    const { result } = mount();
    await waitForSetup();
    expect(H.devices).toHaveLength(1);

    // Raise the hand, then forget the prior emits so we can isolate the re-assert.
    act(() => { result.current.toggleHand(); });
    expect(result.current.handRaised).toBe(true);
    expect(H.socket.emit).toHaveBeenCalledWith('sfu-raise-hand', { raised: true });
    H.socket.emit.mockClear();

    // Reconnect: a fresh device + transports are built, and raise-hand is re-sent.
    await act(async () => { H.socket.connected = true; H.socket._emit('connect'); await Promise.resolve(); });

    await waitFor(() => expect(H.devices).toHaveLength(2));
    await waitFor(() => expect(H.socket.emit).toHaveBeenCalledWith('sfu-raise-hand', { raised: true }));
    expect(result.current.socketConnected).toBe(true);
  });

  it('removes every sfu-* listener on unmount (no leak)', async () => {
    const { unmount } = mount();
    await waitForSetup();

    unmount();

    for (const event of [
      'sfu-new-producer', 'sfu-consumer-closed', 'sfu-peer-left',
      'sfu-producer-paused', 'sfu-producer-resumed', 'sfu-hand-raise-update',
      'sfu-active-speaker', 'connect', 'disconnect',
    ]) {
      expect(H.socket.off).toHaveBeenCalledWith(event, expect.any(Function));
      expect(H.socket._handlers[event] ?? []).toHaveLength(0);
    }
  });

  it('pauses and resumes the local audio producer when toggled', async () => {
    const { result } = mount();
    await waitForSetup();
    expect(result.current.localAudioOn).toBe(true);

    await act(async () => { await result.current.toggleAudio(); });
    expect(result.current.localAudioOn).toBe(false);
    expect(H.request).toHaveBeenCalledWith('sfu-pause-producer', expect.objectContaining({ producerId: expect.any(String) }));

    await act(async () => { await result.current.toggleAudio(); });
    expect(result.current.localAudioOn).toBe(true);
    expect(H.request).toHaveBeenCalledWith('sfu-resume-producer', expect.objectContaining({ producerId: expect.any(String) }));
  });

  it('pauses the local video producer when toggled off', async () => {
    const { result } = mount();
    await waitForSetup();
    expect(result.current.localVideoOn).toBe(true);

    await act(async () => { await result.current.toggleVideo(); });
    expect(result.current.localVideoOn).toBe(false);
  });

  it('toggles raise-hand on then off, emitting both states', async () => {
    const { result } = mount();
    await waitForSetup();

    act(() => { result.current.toggleHand(); });
    expect(result.current.handRaised).toBe(true);
    act(() => { result.current.toggleHand(); });
    expect(result.current.handRaised).toBe(false);
    expect(H.socket.emit).toHaveBeenCalledWith('sfu-raise-hand', { raised: false });
  });

  it('applies a clamped mic gain to the live gain node', async () => {
    const { result } = mount();
    await waitForSetup();

    act(() => { result.current.setMicGain(1.5); });
    expect(result.current.micGain).toBe(1.5);
    // Out-of-range requests clamp into [0, 2].
    act(() => { result.current.setMicGain(5); });
    expect(result.current.micGain).toBe(2);
  });

  it('starts and stops screen sharing', async () => {
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockResolvedValue(
      new FakeMediaStream([fakeTrack('video', 'screen-1')]) as unknown as MediaStream,
    );
    const { result } = mount();
    await waitForSetup();

    await act(async () => { await result.current.shareScreen(); });
    expect(result.current.isScreenSharing).toBe(true);
    expect(result.current.localScreenStream).toBeInstanceOf(FakeMediaStream);
    expect(H.produced.some((p: any) => p.appData?.source === 'screen')).toBe(true);

    act(() => { result.current.stopScreenShare(); });
    expect(result.current.isScreenSharing).toBe(false);
    expect(H.request).toHaveBeenCalledWith('sfu-close-producer', expect.objectContaining({ producerId: expect.any(String) }));
  });

  it('reflects peer pause/resume, hand-raise, and active-speaker events', async () => {
    const { result } = mount();
    await waitForSetup();
    await consumePeer(result, { producerId: 'p-remote-1', socketId: 'peer-1', kind: 'video' });

    await act(async () => { H.socket._emit('sfu-producer-paused', { producerId: 'p-remote-1' }); await Promise.resolve(); });
    expect(result.current.peerStates['peer-1'].video).toBe(false);

    await act(async () => { H.socket._emit('sfu-producer-resumed', { producerId: 'p-remote-1' }); await Promise.resolve(); });
    expect(result.current.peerStates['peer-1'].video).toBe(true);

    await act(async () => { H.socket._emit('sfu-hand-raise-update', { socketId: 'peer-1', raised: true }); await Promise.resolve(); });
    expect(result.current.peerStates['peer-1'].handRaised).toBe(true);

    await act(async () => { H.socket._emit('sfu-active-speaker', { socketId: 'peer-1' }); await Promise.resolve(); });
    expect(result.current.activeSpeaker).toBe('peer-1');
  });

  it('consumes producers already present in the room on join', async () => {
    H.existingProducers = [{
      producerId: 'p-existing', socketId: 'peer-9', user: { name: 'Early Bird', avatar: 'e.png' },
      kind: 'audio', paused: false, appData: { source: 'camera' },
    }];
    H.producerKinds['p-existing'] = 'audio';

    const { result } = mount();

    await waitFor(() => expect(result.current.remoteStreams['peer-9']).toBeDefined());
    expect(result.current.peerStates['peer-9']).toMatchObject({ name: 'Early Bird' });
  });

  it('flags permissionDenied when camera and microphone are both blocked', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));

    const { result } = mount();

    await waitFor(() => expect(result.current.permissionDenied).toBe(true));
    expect(result.current.hasMic).toBe(false);
    expect(result.current.hasCamera).toBe(false);
  });

  it('produces in the paused state when joining muted with camera off', async () => {
    const { result } = mount({ startAudioOn: false, startVideoOn: false });
    await waitForSetup();

    // Tracks are produced (so toggling later is instant) but immediately paused.
    expect(result.current.localAudioOn).toBe(false);
    expect(result.current.localVideoOn).toBe(false);
    const producedTags = H.produced.map((p: any) => p.appData?.mediaTag);
    expect(producedTags).toContain('audio');
    expect(producedTags).toContain('video');
    expect(H.request).toHaveBeenCalledWith('sfu-pause-producer', expect.objectContaining({ producerId: expect.any(String) }));
  });

  it('ignores a screen-share that the user cancels', async () => {
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
    const { result } = mount();
    await waitForSetup();

    await act(async () => { await result.current.shareScreen(); });
    expect(result.current.isScreenSharing).toBe(false);
  });

  it('is a no-op to stop screen sharing when nothing is shared', async () => {
    const { result } = mount();
    await waitForSetup();

    act(() => { result.current.stopScreenShare(); });
    expect(result.current.isScreenSharing).toBe(false);
    expect(H.request).not.toHaveBeenCalledWith('sfu-close-producer', expect.anything());
  });

  it('recovers (stays connected) when the reconnect setup fails', async () => {
    const { result } = mount();
    await waitForSetup();

    // Fail the first signaling call of the reconnect; onSocketConnect should
    // catch it without throwing or wedging the connected state.
    H.request.mockImplementationOnce(async () => { throw new Error('reconnect boom'); });
    await act(async () => { H.socket.connected = true; H.socket._emit('connect'); await Promise.resolve(); });

    await waitFor(() => expect(result.current.socketConnected).toBe(true));
  });

  it('swallows a failed pause request but still updates local mic state', async () => {
    const { result } = mount();
    await waitForSetup();

    await act(async () => {
      H.request.mockImplementationOnce(async () => { throw new Error('network'); });
      await result.current.toggleAudio();
    });
    // The UI reflects the user's intent even though the server call failed.
    expect(result.current.localAudioOn).toBe(false);
  });

  // ── First-connection recovery (issue #160) ────────────────────────────────

  it('does not emit any signaling until the socket is connected (no handshake race)', async () => {
    // Socket starts disconnected and connect() does NOT flip it (models a socket
    // still mid-handshake). setupSfu must wait for `connect` before its 1st emit.
    H.socket.connect.mockImplementationOnce(() => { /* still connecting */ });

    mount();
    // Give init() time to acquire media and reach setupSfu's connect gate.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(H.request).not.toHaveBeenCalled();

    // Socket finishes connecting — setup proceeds and produces media.
    await act(async () => { H.socket.connected = true; H.socket._emit('connect'); await Promise.resolve(); });
    await waitFor(() => expect(H.request).toHaveBeenCalledWith('sfu-get-rtp-capabilities', { roomId: 'room-1' }));
  });

  it('leaves no residual connect listener when unmounted while the socket is still disconnected', async () => {
    // Socket never finishes connecting; setupSfu is parked on its connect gate.
    H.socket.connect.mockImplementationOnce(() => { /* still connecting */ });

    const { unmount } = mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(H.request).not.toHaveBeenCalled();

    unmount();

    // The hook's own onSocketConnect AND the pending waitForSocketConnect
    // closure must both be gone — otherwise each mount/unmount while offline
    // leaks a listener on the singleton socket.
    expect(H.socket._handlers['connect'] ?? []).toHaveLength(0);
  });

  it('retries the FIRST setup on reconnect after it failed mid-handshake, and reaches ready', async () => {
    // First setup fails on its very first request (socket dropped mid-handshake:
    // the initialized flag is never set — the incident's un-retried failure).
    H.request.mockImplementationOnce(async () => { throw new Error('socket disconnected'); });

    const { result } = mount();
    await waitFor(() => expect(result.current.mediaRecovery.status).not.toBe('ready'));
    expect(H.devices).toHaveLength(0); // never got past rtp-capabilities

    // Socket reconnects — setup is retried even though it never completed once.
    await act(async () => { H.socket.connected = true; H.socket._emit('connect'); await Promise.resolve(); });

    await waitFor(() => expect(result.current.mediaRecovery.status).toBe('ready'));
    expect(H.devices.length).toBeGreaterThanOrEqual(1);
  });

  it('exposes an exhausted state after the retry budget is spent, backing off between tries', async () => {
    vi.useFakeTimers();
    try {
      // Every setup attempt fails while the socket stays connected → the backoff
      // ladder runs to exhaustion.
      H.request.mockImplementation(async () => { throw new Error('rtp caps rejected'); });
      H.socket.connect.mockImplementation(() => { H.socket.connected = true; });

      const { result } = mount();
      // Drain init + the whole backoff ladder (capped exponential, 5 retries).
      await vi.advanceTimersByTimeAsync(60000);

      expect(result.current.mediaRecovery.status).toBe('exhausted');
      expect(result.current.mediaRecovery.attempt).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers via the manual retryMedia() affordance once retries are exhausted', async () => {
    vi.useFakeTimers();
    try {
      H.request.mockImplementation(async () => { throw new Error('down'); });
      H.socket.connect.mockImplementation(() => { H.socket.connected = true; });

      const { result } = mount();
      await vi.advanceTimersByTimeAsync(60000);
      expect(result.current.mediaRecovery.status).toBe('exhausted');

      // Server is healthy now; the user clicks Retry.
      H.request.mockImplementation(async (event: string, data: any) => defaultResponder(event, data));
      // Flush the async setup under fake timers (waitFor would hang without a
      // real clock, so advance instead).
      await act(async () => { result.current.retryMedia(); await vi.advanceTimersByTimeAsync(50); });

      expect(result.current.mediaRecovery.status).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not flag permissionDenied when only the camera is unavailable', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(async (constraints?: MediaStreamConstraints) => {
      if (constraints?.audio) return new FakeMediaStream([fakeTrack('audio', 'mic-1')]) as unknown as MediaStream;
      throw Object.assign(new Error('no camera'), { name: 'NotFoundError' });
    });

    const { result } = mount();

    await waitFor(() => expect(result.current.hasMic).toBe(true));
    expect(result.current.hasCamera).toBe(false);
    expect(result.current.permissionDenied).toBe(false);
  });
});

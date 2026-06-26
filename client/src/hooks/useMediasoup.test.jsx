import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared fakes for the SFU client surface — a controllable socket, a stubbed
// `request()` signaling layer, and a mediasoup-client `Device` whose transports
// record produce/consume calls. Hoisted so the vi.mock factories can close over
// them, and inspected from the tests.
const H = vi.hoisted(() => {
  const handlers = {};
  const socket = {
    connected: false,
    id: 'local-socket-id',
    on: vi.fn((event, cb) => { (handlers[event] ||= []).push(cb); }),
    off: vi.fn((event, cb) => { if (handlers[event]) handlers[event] = handlers[event].filter((h) => h !== cb); }),
    emit: vi.fn(),
    connect: vi.fn(() => { socket.connected = true; }),
    disconnect: vi.fn(() => { socket.connected = false; }),
    _handlers: handlers,
    // Push an incoming server event to the hook's registered listeners.
    _emit(event, payload) { (handlers[event] || []).slice().forEach((cb) => cb(payload)); },
  };

  const state = {
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

  function makeProducer(appData) {
    return {
      id: `producer-${appData?.mediaTag ?? appData?.source ?? 'x'}-${++state.pid}`,
      appData, paused: false,
      on: vi.fn(), pause: vi.fn(), resume: vi.fn(), close: vi.fn(),
    };
  }
  function makeConsumer(id, producerId, kind) {
    return {
      id, producerId, kind,
      track: { kind, id: `track-${id}`, stop: vi.fn() },
      close: vi.fn(),
      getStats: vi.fn(async () => new Map()),
    };
  }
  function makeTransport(direction, params) {
    const listeners = {};
    return {
      id: params?.id ?? `${direction}-transport`,
      direction,
      connectionState: 'new',
      on: vi.fn((event, cb) => { listeners[event] = cb; }),
      produce: vi.fn(async ({ track, appData }) => { state.produced.push({ appData, track }); return makeProducer(appData); }),
      consume: vi.fn(async ({ id, producerId, kind }) => { const c = makeConsumer(id, producerId, kind); state.consumed.push(c); return c; }),
      close: vi.fn(),
      _listeners: listeners,
    };
  }
  function makeDevice() {
    const device = {
      rtpCapabilities: { codecs: [], headerExtensions: [] },
      load: vi.fn(async () => {}),
      canProduce: vi.fn(() => true),
      createSendTransport: vi.fn((params) => { const t = makeTransport('send', params); state.sendTransports.push(t); return t; }),
      createRecvTransport: vi.fn((params) => { const t = makeTransport('recv', params); state.recvTransports.push(t); return t; }),
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
  constructor(tracks = []) { this._tracks = [...tracks]; }
  addTrack(t) { this._tracks.push(t); }
  removeTrack(t) { this._tracks = this._tracks.filter((x) => x !== t); }
  getTracks() { return this._tracks; }
  getVideoTracks() { return this._tracks.filter((t) => t.kind === 'video'); }
  getAudioTracks() { return this._tracks.filter((t) => t.kind === 'audio'); }
}
function fakeTrack(kind, deviceId) {
  return { kind, enabled: true, stop: vi.fn(), addEventListener: vi.fn(), getSettings: () => ({ deviceId, sampleRate: 48000 }) };
}
class FakeAudioContext {
  constructor() { this.state = 'running'; this.sampleRate = 48000; }
  createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createMediaStreamDestination() { return { stream: new FakeMediaStream([fakeTrack('audio', 'mic-dest')]), disconnect: vi.fn() }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

const originals = { MediaStream: globalThis.MediaStream, AudioContext: window.AudioContext };

function defaultResponder(event, data) {
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
  H.request.mockImplementation(async (event, data) => defaultResponder(event, data));

  globalThis.MediaStream = FakeMediaStream;
  window.AudioContext = FakeAudioContext;
  navigator.mediaDevices = {
    getUserMedia: vi.fn(async (constraints) => {
      if (constraints.audio) return new FakeMediaStream([fakeTrack('audio', 'mic-1')]);
      if (constraints.video) return new FakeMediaStream([fakeTrack('video', 'cam-1')]);
      return new FakeMediaStream([]);
    }),
    getDisplayMedia: vi.fn(),
  };
});

afterEach(() => {
  globalThis.MediaStream = originals.MediaStream;
  window.AudioContext = originals.AudioContext;
});

function mount(devices = { startAudioOn: true, startVideoOn: true }) {
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
async function consumePeer(result, { producerId = 'p-remote-1', socketId = 'peer-1', kind = 'video', user } = {}) {
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
    const producedTags = H.produced.map((p) => p.appData?.mediaTag);
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
    navigator.mediaDevices.getDisplayMedia.mockResolvedValue(new FakeMediaStream([fakeTrack('video', 'screen-1')]));
    const { result } = mount();
    await waitForSetup();

    await act(async () => { await result.current.shareScreen(); });
    expect(result.current.isScreenSharing).toBe(true);
    expect(result.current.localScreenStream).toBeInstanceOf(FakeMediaStream);
    expect(H.produced.some((p) => p.appData?.source === 'screen')).toBe(true);

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
    navigator.mediaDevices.getUserMedia.mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));

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
    const producedTags = H.produced.map((p) => p.appData?.mediaTag);
    expect(producedTags).toContain('audio');
    expect(producedTags).toContain('video');
    expect(H.request).toHaveBeenCalledWith('sfu-pause-producer', expect.objectContaining({ producerId: expect.any(String) }));
  });

  it('ignores a screen-share that the user cancels', async () => {
    navigator.mediaDevices.getDisplayMedia.mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
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

  it('does not flag permissionDenied when only the camera is unavailable', async () => {
    navigator.mediaDevices.getUserMedia.mockImplementation(async (constraints) => {
      if (constraints.audio) return new FakeMediaStream([fakeTrack('audio', 'mic-1')]);
      throw Object.assign(new Error('no camera'), { name: 'NotFoundError' });
    });

    const { result } = mount();

    await waitFor(() => expect(result.current.hasMic).toBe(true));
    expect(result.current.hasCamera).toBe(false);
    expect(result.current.permissionDenied).toBe(false);
  });
});

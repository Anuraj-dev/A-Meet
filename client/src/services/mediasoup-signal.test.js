import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the configured socket. `request()` calls `socket.timeout(ms).emit(event,
// data, cb)`, so the fake exposes `timeout()` returning an object whose `emit`
// records the call and stashes the ack callback. To model socket.io's own
// ack-timeout, `emit` also schedules an error-callback after `ms` — tests drive
// success/error synchronously, or let fake timers elapse for the timeout path.
const h = vi.hoisted(() => {
  const state = { event: null, data: null, cb: null, timeoutMs: null, timer: null };
  const emit = vi.fn((event, data, cb) => {
    state.event = event;
    state.data = data;
    state.cb = cb;
    state.timer = setTimeout(() => cb(new Error('operation has timed out')), state.timeoutMs);
  });
  const timeout = vi.fn((ms) => { state.timeoutMs = ms; return { emit }; });
  // `connected` mirrors socket.io's live state. `on`/`off` back the one-shot
  // in-flight `disconnect` listener request() attaches so a drop that heals
  // before the ack-timeout fires is still classified as a disconnect.
  const handlers = {};
  const socket = {
    timeout,
    emit: vi.fn(),
    connected: true,
    on: vi.fn((event, cb) => { (handlers[event] ||= []).push(cb); }),
    off: vi.fn((event, cb) => { if (handlers[event]) handlers[event] = handlers[event].filter((fn) => fn !== cb); }),
    _handlers: handlers,
    _emit(event, payload) { (handlers[event] || []).slice().forEach((cb) => cb(payload)); },
  };
  return { state, emit, timeout, socket };
});

const socketMock = h.socket;
vi.mock('./socket', () => ({ default: h.socket }));

import { request, SignalError } from './mediasoup-signal';

// Deliver an ack the way socket.io would (err-first), cancelling the pending
// timeout first so it can't also fire.
function ackSuccess(response) {
  clearTimeout(h.state.timer);
  h.state.cb(null, response);
}
function ackError(message) {
  clearTimeout(h.state.timer);
  h.state.cb(null, { error: message });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  socketMock.connected = true;
  Object.keys(socketMock._handlers).forEach((k) => delete socketMock._handlers[k]);
  h.state.event = h.state.data = h.state.cb = h.state.timeoutMs = h.state.timer = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('services/mediasoup-signal request()', () => {
  it('emits the event + data exactly once and resolves with the ack payload', async () => {
    const p = request('sfu-get-rtp-capabilities', { roomId: 'r1' });

    expect(h.timeout).toHaveBeenCalledWith(10000); // documented default
    expect(h.emit).toHaveBeenCalledTimes(1);
    expect(h.state.event).toBe('sfu-get-rtp-capabilities');
    expect(h.state.data).toEqual({ roomId: 'r1' });

    ackSuccess({ rtpCapabilities: { codecs: [] } });
    await expect(p).resolves.toEqual({ rtpCapabilities: { codecs: [] } });
  });

  it('defaults data to an empty object and forwards a custom timeout', async () => {
    const p = request('sfu-produce', undefined, 3000);

    expect(h.timeout).toHaveBeenCalledWith(3000);
    expect(h.state.data).toEqual({});

    ackSuccess({ id: 'producer-1' });
    await expect(p).resolves.toEqual({ id: 'producer-1' });
  });

  it('rejects with a server-reason SignalError when the ack carries an error', async () => {
    const p = request('sfu-connect-transport', { dtlsParameters: {} });
    ackError('transport already connected');
    await expect(p).rejects.toThrow('transport already connected');
    await expect(p).rejects.toMatchObject({ reason: 'server', event: 'sfu-connect-transport' });
  });

  it('labels a real ack timeout (socket still connected) as reason "timeout"', async () => {
    socketMock.connected = true;
    const p = request('sfu-produce', { kind: 'audio' }, 5000);
    // Attach the rejection expectation before advancing so the rejection is
    // always observed (no unhandled-rejection window).
    const settled = Promise.all([
      expect(p).rejects.toThrow('sfu-produce timed out'),
      expect(p).rejects.toBeInstanceOf(SignalError),
      expect(p).rejects.toMatchObject({ reason: 'timeout', socketConnected: true }),
    ]);
    await vi.advanceTimersByTimeAsync(5000);
    await settled;
  });

  it('labels a mid-handshake drop (socket disconnected) as reason "disconnect", not timeout', async () => {
    const p = request('sfu-get-rtp-capabilities', { roomId: 'r1' });
    // Socket dropped before the ack — the incident's failure mode.
    socketMock.connected = false;
    const settled = Promise.all([
      expect(p).rejects.toMatchObject({ reason: 'disconnect', socketConnected: false, event: 'sfu-get-rtp-capabilities' }),
      expect(p).rejects.toThrow(/socket disconnected/),
    ]);
    await vi.advanceTimersByTimeAsync(10000);
    await settled;
  });

  it('still labels the failure "disconnect" when the socket drops and RECONNECTS before the timeout fires', async () => {
    const p = request('sfu-get-rtp-capabilities', { roomId: 'r1' });
    // The socket drops mid-request…
    socketMock.connected = false;
    socketMock._emit('disconnect', 'transport close');
    // …then heals before the ack-timeout callback fires. Sampling
    // socket.connected at fire time would mislabel this as a real timeout.
    socketMock.connected = true;
    socketMock._emit('connect');
    const settled = expect(p).rejects.toMatchObject({ reason: 'disconnect', event: 'sfu-get-rtp-capabilities' });
    await vi.advanceTimersByTimeAsync(10000);
    await settled;
  });

  it('removes its in-flight disconnect listener once the request settles', async () => {
    const p = request('sfu-get-rtp-capabilities', { roomId: 'r1' });
    expect((socketMock._handlers.disconnect ?? []).length).toBe(1);
    ackSuccess({ rtpCapabilities: { codecs: [] } });
    await p;
    expect((socketMock._handlers.disconnect ?? []).length).toBe(0);
  });

  it('surfaces retryAfterMs from a rate-limit ack error on the SignalError', async () => {
    const p = request('sfu-produce', { kind: 'audio' });
    // Server-side rate limiter answers the ack with the structured shape.
    clearTimeout(h.state.timer);
    h.state.cb(null, { error: 'Rate limit exceeded — slow down and try again.', retryAfterMs: 750 });

    await expect(p).rejects.toBeInstanceOf(SignalError);
    await expect(p).rejects.toMatchObject({ reason: 'server', retryAfterMs: 750 });
  });

  it('leaves retryAfterMs undefined on ordinary server ack errors', async () => {
    const p = request('sfu-connect-transport', { dtlsParameters: {} });
    ackError('transport already connected');
    await expect(p).rejects.toMatchObject({ reason: 'server', retryAfterMs: undefined });
  });
});

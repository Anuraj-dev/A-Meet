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
  return { state, emit, timeout };
});

vi.mock('./socket', () => ({ default: { timeout: h.timeout, emit: vi.fn() } }));

import { request } from './mediasoup-signal';

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

  it('rejects with the server error when the ack carries one', async () => {
    const p = request('sfu-connect-transport', { dtlsParameters: {} });
    ackError('transport already connected');
    await expect(p).rejects.toThrow('transport already connected');
  });

  it('rejects with a "<event> timed out" error when the ack never arrives', async () => {
    const p = request('sfu-produce', { kind: 'audio' }, 5000);
    // Attach the rejection expectation before advancing so the rejection is
    // always observed (no unhandled-rejection window).
    const settled = expect(p).rejects.toThrow('sfu-produce timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await settled;
  });
});

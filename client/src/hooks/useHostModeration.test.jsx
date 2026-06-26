import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useHostModeration } from './useHostModeration';

// Characterization tests for the host-moderation concern extracted from RoomPage.
// They pin the observable contract so the extraction verifiably changes nothing:
//   • spotlightKey driven by inbound sfu-spotlight events
//   • handleSpotlight toggles (clear when already spotlighted)
//   • handleHostMute / handleHostRemove emit the right events
//   • sfu-spotlight listener is cleaned up on unmount (no leak)

function makeSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => { (handlers[event] ??= []).push(cb); }),
    off: vi.fn((event, cb) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== cb);
    }),
    emit: vi.fn(),
    _emitIncoming(event, payload) {
      (handlers[event] ?? []).forEach((fn) => fn(payload));
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useHostModeration', () => {
  it('starts with no spotlightKey', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useHostModeration({ socket }));
    expect(result.current.spotlightKey).toBeNull();
  });

  it('sets spotlightKey when sfu-spotlight fires with a socketId', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useHostModeration({ socket }));

    act(() => socket._emitIncoming('sfu-spotlight', { socketId: 'peer-1' }));

    expect(result.current.spotlightKey).toBe('peer-1');
  });

  it('clears spotlightKey when sfu-spotlight fires with null socketId', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useHostModeration({ socket }));

    act(() => socket._emitIncoming('sfu-spotlight', { socketId: 'peer-1' }));
    act(() => socket._emitIncoming('sfu-spotlight', { socketId: null }));

    expect(result.current.spotlightKey).toBeNull();
  });

  it('clears spotlightKey when sfu-spotlight fires with no payload', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useHostModeration({ socket }));

    act(() => socket._emitIncoming('sfu-spotlight', { socketId: 'peer-1' }));
    act(() => socket._emitIncoming('sfu-spotlight', undefined));

    expect(result.current.spotlightKey).toBeNull();
  });

  it('handleSpotlight emits sfu-spotlight with the person id when not spotlighted', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useHostModeration({ socket }));

    act(() => result.current.handleSpotlight({ id: 'peer-1' }));

    expect(socket.emit).toHaveBeenCalledWith('sfu-spotlight', { socketId: 'peer-1' });
  });

  it('handleSpotlight clears the spotlight when the same person is already spotlighted', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useHostModeration({ socket }));

    // Spotlight peer-1 via incoming event so the hook knows the current key.
    act(() => socket._emitIncoming('sfu-spotlight', { socketId: 'peer-1' }));
    // Calling handleSpotlight on the same peer should send null (toggle off).
    act(() => result.current.handleSpotlight({ id: 'peer-1' }));

    expect(socket.emit).toHaveBeenCalledWith('sfu-spotlight', { socketId: null });
  });

  it('handleHostMute emits sfu-host-mute with the person socketId', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useHostModeration({ socket }));

    act(() => result.current.handleHostMute({ id: 'peer-2' }));

    expect(socket.emit).toHaveBeenCalledWith('sfu-host-mute', { socketId: 'peer-2' });
  });

  it('handleHostRemove emits sfu-host-remove with the person socketId', () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useHostModeration({ socket }));

    act(() => result.current.handleHostRemove({ id: 'peer-3' }));

    expect(socket.emit).toHaveBeenCalledWith('sfu-host-remove', { socketId: 'peer-3' });
  });

  it('removes the sfu-spotlight listener on unmount (no leak)', () => {
    const socket = makeSocket();
    const { unmount } = renderHook(() => useHostModeration({ socket }));

    unmount();

    expect(socket.off).toHaveBeenCalledWith('sfu-spotlight', expect.any(Function));
  });
});

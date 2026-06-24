import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the sound service so we can assert the reaction chime without audio.
vi.mock('../services/sounds', () => ({ playSound: vi.fn() }));

import { useReactions } from './useReactions';
import { playSound } from '../services/sounds';

// Minimal socket.io-style fake: records handlers so tests can invoke an incoming
// `sfu-reaction`, and records on/off/emit calls for lifecycle assertions.
function makeSocket(id = 'me') {
  const handlers = {};
  return {
    id,
    on: vi.fn((event, fn) => { (handlers[event] ||= []).push(fn); }),
    off: vi.fn(),
    emit: vi.fn(),
    // test helper: dispatch an incoming event to all registered handlers
    _emitIncoming(event, payload) { (handlers[event] || []).forEach((fn) => fn(payload)); },
  };
}

function setup(socket) {
  const userRef = { current: { name: 'Me', avatar: 'me.png' } };
  const peerStatesRef = { current: { peer1: { name: 'Peer One', avatar: 'p1.png' } } };
  const view = renderHook(() => useReactions({ socket, userRef, peerStatesRef }));
  return { ...view, userRef, peerStatesRef };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useReactions', () => {
  it('receiving a peer reaction sets active + floating state and plays the sound', () => {
    const socket = makeSocket('me');
    const { result } = setup(socket);

    act(() => socket._emitIncoming('sfu-reaction', { emoji: '👍', socketId: 'peer1' }));

    expect(result.current.activeReactions).toEqual({ peer1: '👍' });
    expect(result.current.floatingReactions).toHaveLength(1);
    expect(result.current.floatingReactions[0]).toMatchObject({
      emoji: '👍', name: 'Peer One', avatar: 'p1.png',
    });
    expect(playSound).toHaveBeenCalledWith('reaction');
  });

  it('a self reaction uses the local user metadata for the floating stream', () => {
    const socket = makeSocket('me');
    const { result } = setup(socket);

    act(() => socket._emitIncoming('sfu-reaction', { emoji: '🎉', socketId: 'me' }));

    expect(result.current.floatingReactions[0]).toMatchObject({
      emoji: '🎉', name: 'Me', avatar: 'me.png',
    });
  });

  it('emitting a local reaction sends the sfu-reaction event', () => {
    const socket = makeSocket('me');
    const { result } = setup(socket);

    act(() => result.current.sendReaction('❤️'));

    expect(socket.emit).toHaveBeenCalledWith('sfu-reaction', { emoji: '❤️' });
  });

  it('expires the floating reaction after 1.8s and the active reaction after 3s', () => {
    const socket = makeSocket('me');
    const { result } = setup(socket);

    act(() => socket._emitIncoming('sfu-reaction', { emoji: '😮', socketId: 'peer1' }));
    expect(result.current.floatingReactions).toHaveLength(1);
    expect(result.current.activeReactions).toEqual({ peer1: '😮' });

    // Floating stream entry is removed at 1.8s; the per-tile reaction persists.
    act(() => vi.advanceTimersByTime(1800));
    expect(result.current.floatingReactions).toHaveLength(0);
    expect(result.current.activeReactions).toEqual({ peer1: '😮' });

    // Per-tile reaction clears at 3s total.
    act(() => vi.advanceTimersByTime(1200));
    expect(result.current.activeReactions).toEqual({});
  });

  it('removes the socket listener on unmount', () => {
    const socket = makeSocket('me');
    const { unmount } = setup(socket);

    const registered = socket.on.mock.calls.find(([event]) => event === 'sfu-reaction');
    expect(registered).toBeDefined();

    unmount();

    expect(socket.off).toHaveBeenCalledWith('sfu-reaction', registered[1]);
  });

  it('clears pending floating + per-tile expiry timers on unmount so none fire after teardown', () => {
    const socket = makeSocket('me');
    const { result, unmount } = setup(socket);

    // Reaction in flight: a 1.8s floating timer and a 3s per-tile timer are pending.
    act(() => socket._emitIncoming('sfu-reaction', { emoji: '👍', socketId: 'peer1' }));
    expect(result.current.floatingReactions).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(2);

    unmount();

    // Cleanup must clear both timers; nothing is left to call a state setter post-unmount.
    expect(vi.getTimerCount()).toBe(0);
    // Advancing past both expiries is now a no-op and must not throw.
    expect(() => act(() => vi.advanceTimersByTime(3000))).not.toThrow();
  });
});

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useScreenShare } from './useScreenShare';

// Characterization tests for the screen-share / presentation behaviour that used
// to live inline in RoomPage. They pin down the observable contract so the
// extraction can be verified to change nothing:
//   • the unified shares model (remote screens + the local screen tile),
//   • pinned-share selection + its derived fallback when the list changes,
//   • hasScreen / the infinity-mirror reveal lifecycle.

const baseProps = {
  remoteScreens: {},
  isScreenSharing: false,
  localScreenStream: null,
  localScreenSurface: null,
  peerStates: {},
  localName: 'Me',
};

// A minimal MediaStream stand-in — the hook only ever passes streams through.
const stream = (label) => ({ label });

describe('useScreenShare', () => {
  it('has no shares and no pinned share when nobody is presenting', () => {
    const { result } = renderHook(() => useScreenShare(baseProps));
    expect(result.current.shares).toEqual([]);
    expect(result.current.pinnedShare).toBeNull();
    expect(result.current.hasScreen).toBe(false);
  });

  it('builds a remote share entry with the peer name', () => {
    const s = stream('remote');
    const { result } = renderHook(() => useScreenShare({
      ...baseProps,
      remoteScreens: { peer1: s },
      peerStates: { peer1: { name: 'Alice' } },
    }));

    expect(result.current.shares).toEqual([
      { key: 'peer1', stream: s, isLocal: false, name: 'Alice', surface: null },
    ]);
    expect(result.current.hasScreen).toBe(true);
    // With no explicit pin, the first remote share is shown.
    expect(result.current.pinnedShare.key).toBe('peer1');
  });

  it('falls back to "Participant" when the peer name is unknown', () => {
    const { result } = renderHook(() => useScreenShare({
      ...baseProps,
      remoteScreens: { ghost: stream('g') },
    }));
    expect(result.current.shares[0].name).toBe('Participant');
  });

  it('adds the local screen tile (with surface + name) when sharing', () => {
    const local = stream('local');
    const { result } = renderHook(() => useScreenShare({
      ...baseProps,
      isScreenSharing: true,
      localScreenStream: local,
      localScreenSurface: 'monitor',
    }));

    expect(result.current.shares).toEqual([
      { key: 'local', stream: local, isLocal: true, name: 'Me', surface: 'monitor' },
    ]);
    expect(result.current.hasScreen).toBe(true);
  });

  it('does not add a local tile while sharing if the stream is missing', () => {
    const { result } = renderHook(() => useScreenShare({
      ...baseProps,
      isScreenSharing: true,
      localScreenStream: null,
    }));
    expect(result.current.shares).toEqual([]);
    // hasScreen still reflects the sharing intent.
    expect(result.current.hasScreen).toBe(true);
  });

  it('prefers a remote share over the local one when nothing is pinned', () => {
    const { result } = renderHook(() => useScreenShare({
      ...baseProps,
      remoteScreens: { peer1: stream('r') },
      isScreenSharing: true,
      localScreenStream: stream('l'),
    }));
    expect(result.current.pinnedShare.isLocal).toBe(false);
    expect(result.current.pinnedShare.key).toBe('peer1');
  });

  it('honours an explicit pin', () => {
    const { result } = renderHook(() => useScreenShare({
      ...baseProps,
      remoteScreens: { peer1: stream('r1'), peer2: stream('r2') },
    }));

    act(() => result.current.setPinnedShareKey('peer2'));
    expect(result.current.pinnedShare.key).toBe('peer2');
  });

  it('derives the pin back to a fallback when the pinned share disappears', () => {
    const { result, rerender } = renderHook((props) => useScreenShare(props), {
      initialProps: {
        ...baseProps,
        remoteScreens: { peer1: stream('r1'), peer2: stream('r2') },
      },
    });

    act(() => result.current.setPinnedShareKey('peer2'));
    expect(result.current.pinnedShare.key).toBe('peer2');

    // peer2 stops sharing — without a setState-in-effect, the derived pinnedShare
    // simply falls back to the remaining share.
    rerender({ ...baseProps, remoteScreens: { peer1: stream('r1') } });
    expect(result.current.pinnedShare.key).toBe('peer1');

    // And when all shares are gone, it falls back to null.
    rerender({ ...baseProps, remoteScreens: {} });
    expect(result.current.pinnedShare).toBeNull();
  });

  it('resets showScreenAnyway when the local share stops', () => {
    const { result, rerender } = renderHook((props) => useScreenShare(props), {
      initialProps: { ...baseProps, isScreenSharing: true, localScreenStream: stream('l') },
    });

    act(() => result.current.setShowScreenAnyway(true));
    expect(result.current.showScreenAnyway).toBe(true);

    // Stop sharing — the guard re-arms.
    rerender({ ...baseProps, isScreenSharing: false, localScreenStream: null });
    expect(result.current.showScreenAnyway).toBe(false);
  });

  it('re-arms the infinity-mirror guard for a fresh share', () => {
    const first = stream('first');
    const { result, rerender } = renderHook((props) => useScreenShare(props), {
      initialProps: { ...baseProps, isScreenSharing: true, localScreenStream: first },
    });

    act(() => result.current.setShowScreenAnyway(true));
    expect(result.current.showScreenAnyway).toBe(true);

    // Stop, then start a brand-new share (new stream object). The reveal does not
    // carry over — the user must opt in again.
    rerender({ ...baseProps, isScreenSharing: false, localScreenStream: null });
    rerender({ ...baseProps, isScreenSharing: true, localScreenStream: stream('second') });
    expect(result.current.showScreenAnyway).toBe(false);
  });
});

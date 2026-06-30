import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRoomLayout, type RoomLayoutOptions } from './useRoomLayout';

// Characterization tests for the layout/focus concern extracted from RoomPage.
// They pin the observable contract so the extraction verifiably changes nothing:
//   • pinnedKey / layoutMode / gridPage state + the handlePin toggle
//   • the derived stage descriptor (kind + focusKey + showRail) that decides
//     which layout RoomPage renders, including:
//       - screen share (hasScreen) always wins → presentation
//       - host spotlight overrides a local pin → focus
//       - a local pin selects the focus tile → focus
//       - explicit spotlight/sidebar layoutMode focuses a fallback
//       - layoutMode 'tiled' forces the grid
//       - auto: alone / solo / grid behaviour
//       - stale focus keys (no longer present) are ignored

const SELF = 'self-sock';

function setup(overrides: Partial<RoomLayoutOptions> = {}) {
  const props: RoomLayoutOptions = {
    selfKey: SELF,
    remoteKeys: [],
    activeSpeaker: null,
    spotlightKey: null,
    hasScreen: false,
    isAlone: true,
    isSoloCall: false,
    ...overrides,
  };
  return renderHook((p) => useRoomLayout(p), { initialProps: props });
}

beforeEach(() => vi.clearAllMocks());

describe('useRoomLayout — state', () => {
  it('starts with no pin, auto layout, and grid page 0', () => {
    const { result } = setup();
    expect(result.current.pinnedKey).toBeNull();
    expect(result.current.layoutMode).toBe('auto');
    expect(result.current.gridPage).toBe(0);
  });

  it('handlePin sets the pinned key, and toggles it off when pinned again', () => {
    const { result } = setup({ remoteKeys: ['peer-1'] });

    act(() => result.current.handlePin({ id: 'peer-1' }));
    expect(result.current.pinnedKey).toBe('peer-1');

    act(() => result.current.handlePin({ id: 'peer-1' }));
    expect(result.current.pinnedKey).toBeNull();
  });

  it('handlePin switches the pin to a different person', () => {
    const { result } = setup({ remoteKeys: ['peer-1', 'peer-2'] });

    act(() => result.current.handlePin({ id: 'peer-1' }));
    act(() => result.current.handlePin({ id: 'peer-2' }));

    expect(result.current.pinnedKey).toBe('peer-2');
  });

  it('exposes layout-mode and grid-page setters', () => {
    const { result } = setup({ remoteKeys: ['peer-1'] });

    act(() => result.current.setLayoutMode('tiled'));
    expect(result.current.layoutMode).toBe('tiled');

    act(() => result.current.setGridPage(2));
    expect(result.current.gridPage).toBe(2);
  });
});

describe('useRoomLayout — stage derivation', () => {
  it('renders the alone layout when the viewer is by themselves', () => {
    const { result } = setup({ isAlone: true });
    expect(result.current.stage.kind).toBe('alone');
  });

  it('renders the solo layout for a one-to-one call', () => {
    const { result } = setup({
      remoteKeys: ['peer-1'], isAlone: false, isSoloCall: true,
    });
    expect(result.current.stage.kind).toBe('solo');
  });

  it('renders the grid for a multi-party call in auto mode', () => {
    const { result } = setup({
      remoteKeys: ['peer-1', 'peer-2'], isAlone: false, isSoloCall: false,
    });
    expect(result.current.stage.kind).toBe('grid');
  });

  it('screen share wins over everything → presentation', () => {
    const { result } = setup({
      remoteKeys: ['peer-1'], isAlone: false, isSoloCall: true, hasScreen: true,
    });
    expect(result.current.stage.kind).toBe('presentation');
  });

  it('a local pin selects the focused layout on that tile', () => {
    const { result } = setup({
      remoteKeys: ['peer-1', 'peer-2'], isAlone: false,
    });
    act(() => result.current.handlePin({ id: 'peer-1' }));

    expect(result.current.stage.kind).toBe('focus');
    expect(result.current.stage.focusKey).toBe('peer-1');
    // auto layout keeps the rail visible alongside the focused tile.
    expect(result.current.stage.showRail).toBe(true);
  });

  it('host spotlight overrides a local pin', () => {
    const { result } = setup({
      remoteKeys: ['peer-1', 'peer-2'], isAlone: false, spotlightKey: 'peer-2',
    });
    act(() => result.current.handlePin({ id: 'peer-1' }));

    expect(result.current.stage.kind).toBe('focus');
    expect(result.current.stage.focusKey).toBe('peer-2');
  });

  it('ignores a pinned key for a participant who has left', () => {
    const { result, rerender } = setup({
      remoteKeys: ['peer-1', 'peer-2'], isAlone: false, isSoloCall: false,
    });
    act(() => result.current.handlePin({ id: 'peer-1' }));
    expect(result.current.stage.kind).toBe('focus');

    // peer-1 leaves the call.
    rerender({
      selfKey: SELF, remoteKeys: ['peer-2'], activeSpeaker: null,
      spotlightKey: null, hasScreen: false, isAlone: false, isSoloCall: true,
    });

    // Stale pin no longer drives a focus layout; falls back to solo.
    expect(result.current.stage.kind).toBe('solo');
  });

  it('layoutMode "tiled" forces the grid even for a solo call', () => {
    const { result } = setup({
      remoteKeys: ['peer-1'], isAlone: false, isSoloCall: true,
    });
    act(() => result.current.setLayoutMode('tiled'));
    expect(result.current.stage.kind).toBe('grid');
  });

  it('layoutMode "spotlight" focuses without a rail, following the active speaker', () => {
    const { result } = setup({
      remoteKeys: ['peer-1', 'peer-2'], isAlone: false, activeSpeaker: 'peer-2',
    });
    act(() => result.current.setLayoutMode('spotlight'));

    expect(result.current.stage.kind).toBe('focus');
    expect(result.current.stage.focusKey).toBe('peer-2');
    expect(result.current.stage.showRail).toBe(false);
  });

  it('layoutMode "sidebar" focuses with a rail, falling back to the first remote', () => {
    const { result } = setup({
      remoteKeys: ['peer-1', 'peer-2'], isAlone: false, activeSpeaker: null,
    });
    act(() => result.current.setLayoutMode('sidebar'));

    expect(result.current.stage.kind).toBe('focus');
    expect(result.current.stage.focusKey).toBe('peer-1');
    expect(result.current.stage.showRail).toBe(true);
  });

  it('explicit spotlight/sidebar with no remotes falls back to self', () => {
    const { result } = setup({
      remoteKeys: [], isAlone: true, activeSpeaker: null,
    });
    act(() => result.current.setLayoutMode('sidebar'));

    expect(result.current.stage.kind).toBe('focus');
    expect(result.current.stage.focusKey).toBe(SELF);
  });

  it('an explicit pin keeps the rail visible (showRail true) in auto mode', () => {
    const { result } = setup({
      remoteKeys: ['peer-1'], isAlone: false, isSoloCall: true,
    });
    act(() => result.current.handlePin({ id: 'peer-1' }));
    expect(result.current.stage.showRail).toBe(true);
  });
});

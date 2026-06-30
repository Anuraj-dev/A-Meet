import { useCallback, useMemo, useState } from 'react';

// Owns the layout / focus concern extracted from RoomPage:
//   • pinnedKey   — a LOCAL per-viewer pin (any participant); just for me.
//   • layoutMode  — the layout chooser: 'auto' | 'tiled' | 'spotlight' | 'sidebar'.
//                   'auto' keeps the smart alone/solo/grid behaviour.
//   • gridPage    — pagination index for large grid calls.
//   • handlePin   — toggles the local pin on a participant.
//
// The host SPOTLIGHT (server-relayed, applies to everyone) lives in
// useHostModeration; it is passed in as `spotlightKey` because it overrides the
// local pin when deciding the focused tile.
//
// The hook derives a `stage` descriptor — { kind, focusKey, showRail } — that
// tells RoomPage which layout to render. RoomPage keeps the presentational
// render functions; this hook only owns the decision (and the focus key), so the
// behaviour matches the original inline derivation exactly:
//   - screen share always wins → 'presentation'
//   - an explicit focus (spotlight, else pin) or a spotlight/sidebar layoutMode
//     → 'focus' on the chosen key (spotlight beats pin; fallback is the active
//     speaker, else the first remote, else self). showRail is false only for the
//     'spotlight' layout.
//   - layoutMode 'tiled' → 'grid'
//   - otherwise 'auto': 'alone' / 'solo' / 'grid'.
//
// A focus key is only honoured while that participant is still present, so a
// stale pin/spotlight (someone who left) cleanly falls back.
//
// @param {object} opts
// @param {string}        opts.selfKey      this viewer's socket id
// @param {string[]}      opts.remoteKeys   socket ids of remote participants
// @param {string|null}   opts.activeSpeaker
// @param {string|null}   opts.spotlightKey host spotlight (from useHostModeration)
// @param {boolean}       opts.hasScreen    a screen share is on stage
// @param {boolean}       opts.isAlone      no remotes and not sharing
// @param {boolean}       opts.isSoloCall   exactly one remote, no share
export function useRoomLayout({
  selfKey,
  remoteKeys,
  activeSpeaker,
  spotlightKey,
  hasScreen,
  isAlone,
  isSoloCall,
}) {
  const [pinnedKey, setPinnedKey] = useState(null);
  const [layoutMode, setLayoutMode] = useState('auto'); // auto | tiled | spotlight | sidebar
  const [gridPage, setGridPage] = useState(0); // grid pagination for large calls

  const handlePin = useCallback(
    (person) => setPinnedKey((k) => (k === person.id ? null : person.id)),
    [],
  );

  const stage = useMemo(() => {
    // A focus key is only valid if that person is still present.
    const keyPresent = (k) => Boolean(k) && (k === selfKey || remoteKeys.includes(k));
    const explicitFocus = keyPresent(spotlightKey)
      ? spotlightKey
      : keyPresent(pinnedKey) ? pinnedKey : null;
    // Layout chooser forcing spotlight/sidebar with no explicit pick → follow the
    // active speaker, else the first remote, else self.
    const fallbackFocus = keyPresent(activeSpeaker)
      ? activeSpeaker
      : (remoteKeys[0] ?? selfKey);
    const wantsFocus = Boolean(explicitFocus)
      || layoutMode === 'spotlight' || layoutMode === 'sidebar';
    const displayFocus = explicitFocus ?? fallbackFocus;

    // Decide the active stage layout (screen share always wins).
    if (hasScreen) return { kind: 'presentation' };
    if (wantsFocus) {
      return { kind: 'focus', focusKey: displayFocus, showRail: layoutMode !== 'spotlight' };
    }
    if (layoutMode === 'tiled') return { kind: 'grid' };
    if (isAlone) return { kind: 'alone' };
    if (isSoloCall) return { kind: 'solo' };
    return { kind: 'grid' };
  }, [
    selfKey, remoteKeys, activeSpeaker, spotlightKey,
    pinnedKey, layoutMode, hasScreen, isAlone, isSoloCall,
  ]);

  return {
    pinnedKey, setPinnedKey, handlePin,
    layoutMode, setLayoutMode,
    gridPage, setGridPage,
    stage,
  };
}

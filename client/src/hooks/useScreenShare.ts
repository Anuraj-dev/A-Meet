import { useCallback, useMemo, useState } from 'react';

export interface ScreenSharePeerState {
  name?: string;
}

export interface ScreenShareOptions {
  remoteScreens: Record<string, MediaStream>;
  isScreenSharing: boolean;
  localScreenStream: MediaStream | null;
  localScreenSurface: string | null;
  peerStates: Record<string, ScreenSharePeerState>;
  localName?: string;
}

export interface ScreenShareEntry {
  key: string;
  stream: MediaStream;
  isLocal: boolean;
  name: string;
  surface: string | null;
}

// Owns the screen-share / presentation concern extracted from RoomPage so it can
// be tested in isolation and so RoomPage moves toward a thin composition:
//   • shares          — the unified presentation model (remote screens + your own
//                       local screen), avoiding the self-mirror loop and supporting
//                       multiple simultaneous shares.
//   • pinnedShare     — the share currently shown on the presentation stage.
//                       Derived (not stored): when the user's pinned key is no
//                       longer present in `shares` it transparently falls back to
//                       the first remote share, then the first share, then null.
//                       This replaces the previous setState-in-effect that reset
//                       `pinnedShareKey` whenever the list changed.
//   • hasScreen       — whether the presentation layout should take the stage.
//   • showScreenAnyway — opt-in reveal past the local "infinity mirror" guard,
//                       reset whenever the local share stops so a fresh share
//                       re-arms the guard.
//
// The actual getDisplayMedia producer lives in useMediasoup; this hook owns the
// presentation/pin UI state only, not the transport.
//
// @param {object} opts
// @param {Record<string, MediaStream>} opts.remoteScreens   remote screen streams keyed by socket id
// @param {boolean}     opts.isScreenSharing                 is the local user sharing their screen
// @param {MediaStream|null} opts.localScreenStream          the local screen stream (when sharing)
// @param {string|null} opts.localScreenSurface             the local capture surface ('monitor'|'window'|…)
// @param {Record<string, { name?: string }>} opts.peerStates  peer metadata keyed by socket id
// @param {string} [opts.localName]                          display name for the local screen tile
export function useScreenShare({
  remoteScreens,
  isScreenSharing,
  localScreenStream,
  localScreenSurface,
  peerStates,
  localName = 'You',
}: ScreenShareOptions) {
  const remoteScreenEntries = Object.entries(remoteScreens ?? {});

  // Unified shares model — avoids self-mirror loop and supports multi-share.
  const shares = useMemo(
    () => [
      ...remoteScreenEntries.map(([sid, stream]) => ({
        key: sid,
        stream,
        isLocal: false,
        name: peerStates?.[sid]?.name ?? 'Participant',
        surface: null,
      })),
      ...(isScreenSharing && localScreenStream
        ? [{
          key: 'local',
          stream: localScreenStream,
          isLocal: true,
          name: localName,
          surface: localScreenSurface,
        }]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remoteScreens, isScreenSharing, localScreenStream, localScreenSurface, peerStates, localName],
  );

  // The user's requested pin. Validity is handled by deriving pinnedShare below,
  // so a stale key never needs a setState-in-effect to be cleared.
  const [pinnedShareKey, setPinnedShareKey] = useState<string | null>(null);
  const pinnedShare = shares.find((s) => s.key === pinnedShareKey)
    ?? shares.find((s) => !s.isLocal)
    ?? shares[0]
    ?? null;

  const hasScreen = isScreenSharing || remoteScreenEntries.length > 0;

  // Opt-in reveal past the local "infinity mirror" guard. Keyed to the *specific*
  // local stream the user revealed, so the guard re-arms automatically: stopping
  // the share drops localScreenStream (→ false), and a fresh share produces a new
  // stream object that no longer matches the revealed one (→ false again). This
  // replaces the previous setState-in-effect reset with pure derived state.
  const [revealedStream, setRevealedStream] = useState<MediaStream | null>(null);
  const showScreenAnyway = isScreenSharing
    && localScreenStream != null
    && revealedStream === localScreenStream;
  const setShowScreenAnyway = useCallback(
    (value: boolean) => setRevealedStream(value ? localScreenStream : null),
    [localScreenStream],
  );

  return {
    shares,
    pinnedShare,
    pinnedShareKey,
    setPinnedShareKey,
    hasScreen,
    showScreenAnyway,
    setShowScreenAnyway,
  };
}

import { useCallback, useEffect, useState } from 'react';
import type { AppSocket } from '../services/socket';

interface PersonRef { id: string }
interface HostModerationOptions { socket: AppSocket }

// Owns the host-moderation concern extracted from RoomPage:
//   • spotlightKey    — the socket id currently spotlighted by the host (or null).
//   • handleSpotlight — toggles the spotlight on a participant via sfu-spotlight.
//   • handleHostMute  — sends sfu-host-mute to silence a participant.
//   • handleHostRemove — sends sfu-host-remove to eject a participant.
//
// The inbound sfu-spotlight listener drives spotlightKey so all peers
// (including the host) converge on the same state via the server echo.
// Host-gating is the caller's responsibility: the hook exposes the actions
// unconditionally but RoomPage only renders the controls when isHost is true,
// matching the original behaviour.
//
// @param {object} opts
// @param {import('socket.io-client').Socket} opts.socket
export function useHostModeration({ socket }: HostModerationOptions) {
  const [spotlightKey, setSpotlightKey] = useState<string | null>(null);

  useEffect(() => {
    const onSpotlight = (payload?: { socketId: string | null }) => setSpotlightKey(payload?.socketId ?? null);
    socket.on('sfu-spotlight', onSpotlight);
    return () => {
      socket.off('sfu-spotlight', onSpotlight);
    };
  }, [socket]);

  // Toggle: spotlighting an already-spotlighted peer clears the spotlight.
  const handleSpotlight = useCallback(
    (person: PersonRef) => socket.emit('sfu-spotlight', { socketId: spotlightKey === person.id ? null : person.id }),
    [socket, spotlightKey],
  );

  const handleHostMute = useCallback(
    (person: PersonRef) => socket.emit('sfu-host-mute', { socketId: person.id }),
    [socket],
  );

  const handleHostRemove = useCallback(
    (person: PersonRef) => socket.emit('sfu-host-remove', { socketId: person.id }),
    [socket],
  );

  return { spotlightKey, handleSpotlight, handleHostMute, handleHostRemove };
}

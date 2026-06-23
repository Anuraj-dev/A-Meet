import { useEffect, useRef, useState, useCallback } from 'react';
import { playSound } from '../services/sounds';

// Owns the meeting reaction feature, extracted from RoomPage so it can be tested
// in isolation:
//   • activeReactions  — per-tile emoji ({ [socketId]: emoji }), auto-cleared after 3s
//   • floatingReactions — the bottom-left floating stream ({ id, emoji, name, avatar }),
//     each removed after 1.8s
//   • the `sfu-reaction` socket subscription lifecycle + timer cleanup on unmount
//
// Metadata for the floating stream is read fresh from refs at event time (not
// captured at subscribe time), so a self-reaction shows the local user and a peer
// reaction shows that peer's current name/avatar.
//
// @param {object}   opts
// @param {import('socket.io-client').Socket} opts.socket
// @param {{ current: { name?: string, avatar?: string } }} opts.userRef
// @param {{ current: Record<string, { name?: string, avatar?: string }> }} opts.peerStatesRef
export function useReactions({ socket, userRef, peerStatesRef }) {
  const [activeReactions, setActiveReactions] = useState({});
  const [floatingReactions, setFloatingReactions] = useState([]);
  const reactionTimers = useRef({});
  const floatIdRef = useRef(0);

  useEffect(() => {
    const onReaction = ({ emoji, socketId }) => {
      setActiveReactions((prev) => ({ ...prev, [socketId]: emoji }));
      playSound('reaction');
      clearTimeout(reactionTimers.current[socketId]);
      reactionTimers.current[socketId] = setTimeout(() => {
        setActiveReactions((prev) => {
          const next = { ...prev }; delete next[socketId]; return next;
        });
      }, 3000);
      // Bottom-left floating stream — read fresh metadata via refs.
      const isSelf = socketId === socket.id;
      const meta = isSelf
        ? { name: userRef.current?.name, avatar: userRef.current?.avatar }
        : { name: peerStatesRef.current[socketId]?.name, avatar: peerStatesRef.current[socketId]?.avatar };
      const fid = (floatIdRef.current += 1);
      setFloatingReactions((p) => [...p, { id: fid, emoji, ...meta }]);
      setTimeout(() => setFloatingReactions((p) => p.filter((r) => r.id !== fid)), 1800);
    };

    socket.on('sfu-reaction', onReaction);
    const timers = reactionTimers.current;
    return () => {
      socket.off('sfu-reaction', onReaction);
      // Clear pending per-tile expiry timers so they can't fire after unmount.
      for (const id of Object.values(timers)) clearTimeout(id);
    };
  }, [socket, userRef, peerStatesRef]);

  // Emit a reaction; the server echoes it back via io.in, so the local user's
  // own reaction renders and plays the sound through the same `sfu-reaction` path.
  const sendReaction = useCallback((emoji) => {
    socket.emit('sfu-reaction', { emoji });
  }, [socket]);

  return { activeReactions, floatingReactions, sendReaction };
}

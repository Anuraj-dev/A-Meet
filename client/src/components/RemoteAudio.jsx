import { useEffect, useRef } from 'react';

// Plays a single remote peer's audio through a dedicated, hidden <audio>
// element. Deliberately separate from the camera <video> tile so that:
//   - audio never depends on the tile being mounted — it survives the
//     grid ↔ presentation ↔ solo layout switches that remount tiles;
//   - a late-arriving audio track is reliably rendered. `stream` is a fresh
//     MediaStream reference each time its tracks change (see useMediasoup), so
//     this effect re-runs and re-binds srcObject, defeating Chrome's
//     "track added to an already-playing element isn't heard" race.
function PeerAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    // Autoplay may be blocked until a user gesture; the user always clicks to
    // join, so this normally succeeds. Swallow the rejection either way.
    el.play?.().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

// Renders one hidden <audio> per remote peer. Mount this ONCE in RoomPage,
// outside the tile layout, so the elements persist for the whole call.
export default function RemoteAudio({ streams }) {
  return (
    <>
      {Object.entries(streams).map(([socketId, stream]) => (
        <PeerAudio key={socketId} stream={stream} />
      ))}
    </>
  );
}

import { useEffect, useRef } from 'react';

// Plays a single remote peer's audio through a dedicated, hidden <audio>
// element. Deliberately separate from the camera <video> tile so that:
//   - audio never depends on the tile being mounted — it survives the
//     grid ↔ presentation ↔ solo layout switches that remount tiles;
//   - a late-arriving audio track is reliably rendered. `stream` is a fresh
//     MediaStream reference each time its tracks change (see useMediasoup), so
//     this effect re-runs and re-binds srcObject, defeating Chrome's
//     "track added to an already-playing element isn't heard" race.
function PeerAudio({ stream, volume = 1 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play?.().catch(() => {});
  }, [stream]);
  useEffect(() => {
    const el = ref.current;
    if (el) el.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);
  return <audio ref={ref} autoPlay playsInline />;
}

// Renders one hidden <audio> per remote peer. Mount this ONCE in RoomPage,
// outside the tile layout, so the elements persist for the whole call.
export default function RemoteAudio({ streams, volume = 1 }) {
  return (
    <>
      {Object.entries(streams).map(([socketId, stream]) => (
        <PeerAudio key={socketId} stream={stream} volume={volume} />
      ))}
    </>
  );
}

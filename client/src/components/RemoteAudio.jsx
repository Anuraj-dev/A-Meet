import { useEffect, useRef } from 'react';
import { appLogger } from '../utils/logger';

// Plays a single remote peer's audio through a Web Audio GainNode routed to
// ctx.destination. Using GainNode instead of el.volume because HTMLMediaElement
// .volume is unreliable for WebRTC streams on Linux/PipeWire — the same reason
// the mic uses a GainNode on the send side. `volume` is the already-resolved
// per-peer level (master × peer override); see RemoteAudio below.
function PeerAudio({ socketId, stream, volume = 1 }) {
  const ctxRef = useRef(null);
  const gainRef = useRef(null);
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
    if (gainRef.current) {
      const clamped = Math.max(0, Math.min(1, volume));
      gainRef.current.gain.value = clamped;
      appLogger.info('speaker gain updated', { socketId, volume: clamped });
    }
  }, [volume, socketId]);

  useEffect(() => {
    if (!stream) return;

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const src = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gainRef.current = gain;
    const clamped = Math.max(0, Math.min(1, volumeRef.current));
    gain.gain.value = clamped;
    src.connect(gain);
    gain.connect(ctx.destination);

    appLogger.info('speaker stream bound', { socketId, ctxState: ctx.state, volume: clamped });

    return () => {
      try { src.disconnect(); gain.disconnect(); } catch { /* nodes already detached */ }
      ctx.close();
      if (ctxRef.current === ctx) { ctxRef.current = null; gainRef.current = null; }
    };
  }, [stream, socketId]);

  return null;
}

// Renders one GainNode audio graph per remote peer. Mount this ONCE in RoomPage,
// outside the tile layout, so the graphs persist for the whole call.
// masterVolume: global speaker slider (0–1).
// peerVolumes: per-peer overrides keyed by socketId (0–1, default 1).
// Final per-peer gain = clamp(masterVolume × peerVolume, 0, 1).
export default function RemoteAudio({ streams, masterVolume = 1, peerVolumes = {} }) {
  return (
    <>
      {Object.entries(streams).map(([socketId, stream]) => {
        const pv = peerVolumes[socketId] ?? 1;
        const finalVol = Math.max(0, Math.min(1, masterVolume * pv));
        return (
          <PeerAudio key={socketId} socketId={socketId} stream={stream} volume={finalVol} />
        );
      })}
    </>
  );
}

import { useEffect, useRef } from 'react';

// Shared AudioContext for all analysers — never connected to destination.
let sharedCtx;
function getCtx() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

// Sets `--lvl` (0..1) on the returned ref element via rAF.
// Analyser-only — never wired to ctx.destination (would crackle on PipeWire).
export function useAudioLevel(stream, enabled = true) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const track = stream?.getAudioTracks?.()[0];
    if (!el || !enabled || !track) {
      if (el) el.style.setProperty('--lvl', '0');
      return undefined;
    }
    let raf = 0;
    let src;
    let analyser;
    let smoothed = 0;
    let disposed = false;
    try {
      const ctx = getCtx();
      src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (disposed) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const level = Math.min(1, rms * 3.2);
        smoothed += (level - smoothed) * (level > smoothed ? 0.5 : 0.12);
        el.style.setProperty('--lvl', smoothed.toFixed(3));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch { /* metering unavailable */ }
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      try { src?.disconnect(); } catch { /* ignore */ }
      try { analyser?.disconnect(); } catch { /* ignore */ }
      if (el) el.style.setProperty('--lvl', '0');
    };
  }, [stream, enabled]);
  return ref;
}

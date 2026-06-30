import { useCallback, useEffect, useRef, useState } from 'react';
import { drawComposite, syncSources } from '../utils/video-composite';
import type { CompositeSource, CompositeTile } from '../utils/video-composite';

interface PictureInPictureOptions { auto?: boolean }
interface PictureInPictureController {
  toggle: () => Promise<void>;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  warmUp: () => void;
}

// Picture-in-Picture "mini player" — keeps participants visible in a small
// always-on-top window when the user switches tabs/apps (like Google Meet).
//
// How it works: we composite every camera tile onto an offscreen <canvas>,
// expose it as a MediaStream via canvas.captureStream(), feed that into a
// hidden <video>, and call video.requestPictureInPicture(). The browser then
// floats that single video above all windows. We redraw on an interval (RAF is
// paused in background tabs, so a timer is used instead — background tabs clamp
// it to ~1fps, which is fine for an at-a-glance monitor).
//
// Drawing MediaStream frames to canvas does NOT taint it (tainting only comes
// from cross-origin <img>/<video src>), so captureStream() stays usable.
//
// Support: Chromium-based browsers (Chrome/Edge/Brave). Firefox/Safari don't
// expose the standard requestPictureInPicture, so the feature hides itself.

const PIP_W = 480;
const PIP_H = 270;
const FPS = 15;
// Redraw cadence is derived from FPS so the canvas and captureStream agree
// (background tabs clamp timers to ~1fps regardless, which is fine here).
const TICK_MS = Math.round(1000 / FPS);

function detectSupport(): boolean {
  return (
    typeof document !== 'undefined' &&
    !!document.pictureInPictureEnabled &&
    typeof HTMLVideoElement !== 'undefined' &&
    'requestPictureInPicture' in HTMLVideoElement.prototype
  );
}

export function usePictureInPicture(tiles: CompositeTile[], { auto = true }: PictureInPictureOptions = {}) {
  const [supported] = useState(detectSupport);
  const [active, setActive] = useState(false);

  // Live ref so the imperative draw loop always sees the latest tiles.
  const tilesRef = useRef(tiles);
  useEffect(() => { tilesRef.current = tiles; }, [tiles]);

  // Read `active` without making the auto-pip effect re-register on every change.
  const activeRef = useRef(false);
  useEffect(() => { activeRef.current = active; }, [active]);

  // The imperative controller lives in a mount-only effect and is reached
  // through this ref; everything dynamic is read via refs, so no stale state.
  const ctrlRef = useRef<PictureInPictureController | null>(null);

  useEffect(() => {
    if (!supported) return undefined;

    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1';
    const canvas = document.createElement('canvas');
    canvas.width = PIP_W;
    canvas.height = PIP_H;
    const pipVideo = document.createElement('video');
    pipVideo.muted = true;
    pipVideo.playsInline = true;
    pipVideo.autoplay = true;
    host.appendChild(pipVideo);
    document.body.appendChild(host);

    const sources = new Map<string, CompositeSource>();
    let loop = 0;
    let capture: MediaStream | null = null;

    const tick = () => {
      syncSources(tilesRef.current, sources, host);
      drawComposite(canvas, tilesRef.current, sources);
    };

    const teardownLoop = () => {
      if (loop) { clearInterval(loop); loop = 0; }
      if (capture) { capture.getTracks().forEach((tr) => tr.stop()); capture = null; }
      pipVideo.srcObject = null;
      sources.forEach((s) => { s.video.srcObject = null; s.video.remove(); });
      sources.clear();
    };

    // Idempotent: starts the canvas draw loop and wires the capture stream into
    // the hidden video so requestPictureInPicture() can fire without any async
    // delays (the video must already be playing for Chrome to allow auto-pip
    // from visibilitychange).
    const warmUp = () => {
      if (!loop) { tick(); loop = window.setInterval(tick, TICK_MS); }
      if (!capture) { capture = canvas.captureStream(FPS); pipVideo.srcObject = capture; }
      pipVideo.play().catch(() => {});
    };

    const start = async () => {
      warmUp(); // ensure loop + video are running before the PiP request
      try {
        if (pipVideo.readyState < HTMLMediaElement.HAVE_METADATA) {
          await new Promise<void>((resolve) => {
            pipVideo.addEventListener('loadedmetadata', () => resolve(), { once: true });
          });
        }
        await pipVideo.requestPictureInPicture();
        // `active` is flipped on by the enterpictureinpicture event.
      } catch (err) {
        setActive(false);
        throw err;
      }
    };

    // stop() only exits PiP; teardownLoop() runs only on unmount.
    // Keeping the canvas loop alive between PiP sessions means the video is
    // always warm, so the next auto-pip visibilitychange triggers immediately.
    const stop = async () => {
      try {
        if (document.pictureInPictureElement === pipVideo) await document.exitPictureInPicture();
      } catch { /* ignore */ }
      setActive(false);
    };

    const onEnter = () => setActive(true);
    const onLeave = () => { setActive(false); };
    pipVideo.addEventListener('enterpictureinpicture', onEnter);
    pipVideo.addEventListener('leavepictureinpicture', onLeave);

    // Serialize start/stop so rapid double-clicks can't interleave.
    let busy = false;
    ctrlRef.current = {
      toggle: async () => {
        if (busy) return;
        busy = true;
        try {
          if (document.pictureInPictureElement === pipVideo) await stop();
          else await start();
        } finally {
          busy = false;
        }
      },
      enter: start,
      exit: stop,
      warmUp,
    };

    return () => {
      pipVideo.removeEventListener('enterpictureinpicture', onEnter);
      pipVideo.removeEventListener('leavepictureinpicture', onLeave);
      if (document.pictureInPictureElement === pipVideo) {
        document.exitPictureInPicture().catch(() => {});
      }
      teardownLoop();
      host.remove();
      ctrlRef.current = null;
    };
  }, [supported]);

  // Pre-warm: start the canvas loop as soon as tiles exist so the video is
  // already playing when visibilitychange fires — Chrome requires the element
  // to be in a "used" playback state for auto-pip from visibilitychange.
  useEffect(() => {
    if (!supported) return;
    ctrlRef.current?.warmUp?.();
  }, [supported, tiles.length]);

  // Auto-PiP: enter when tab goes hidden, exit when it returns.
  // Uses activeRef (not `active`) so this effect doesn't re-register on every
  // active-state change — the listener must stay stable across PiP sessions.
  useEffect(() => {
    if (!supported || !auto) return undefined;
    const onVis = () => {
      const ctrl = ctrlRef.current;
      if (!ctrl) return;
      if (document.hidden) {
        if ((tilesRef.current?.length ?? 0) > 0) ctrl.enter?.().catch(() => {});
      } else if (activeRef.current || document.pictureInPictureElement) {
        ctrl.exit?.().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [supported, auto]);

  const togglePiP = useCallback(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return Promise.reject(new Error('pip-unavailable'));
    return Promise.resolve(ctrl.toggle());
  }, []);

  return { pipSupported: supported, pipActive: active, togglePiP };
}

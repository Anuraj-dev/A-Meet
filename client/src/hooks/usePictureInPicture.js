import { useCallback, useEffect, useRef, useState } from 'react';
import { getPeerColor } from '../utils/peer-color';

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

function detectSupport() {
  return (
    typeof document !== 'undefined' &&
    !!document.pictureInPictureEnabled &&
    typeof HTMLVideoElement !== 'undefined' &&
    'requestPictureInPicture' in HTMLVideoElement.prototype
  );
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

// A small crossed-mic glyph drawn by hand (avoids platform emoji inconsistency).
function drawMutedBadge(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  const mw = r * 0.42;
  const mh = r * 0.82;
  roundRectPath(ctx, cx - mw / 2, cy - mh / 2, mw, mh, mw / 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy - r * 0.55);
  ctx.lineTo(cx + r * 0.55, cy + r * 0.55);
  ctx.stroke();
  ctx.restore();
}

// Keep one hidden <video> per stream so we have frames to draw to the canvas.
function syncSources(tiles, sources, host) {
  if (!tiles || !host) return;
  const live = new Set();
  for (const t of tiles) {
    if (!t.stream) continue;
    live.add(t.key);
    let entry = sources.get(t.key);
    if (!entry) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
      host.appendChild(v);
      entry = { video: v, stream: null };
      sources.set(t.key, entry);
    }
    if (entry.stream !== t.stream) {
      entry.video.srcObject = t.stream;
      entry.stream = t.stream;
      entry.video.play().catch(() => {});
    }
  }
  for (const [key, entry] of sources) {
    if (!live.has(key)) {
      entry.video.srcObject = null;
      entry.video.remove();
      sources.delete(key);
    }
  }
}

function drawCell(ctx, t, video, x, y, w, h) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.clip();

  const hasVideo = t.videoOn && video && video.readyState >= 2 && video.videoWidth > 0;

  // --- video frame or off-cam placeholder (drawn in cell-local coords) ---
  ctx.save();
  ctx.translate(x, y);
  if (hasVideo) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(w / vw, h / vh); // cover
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    if (t.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = getPeerColor(t.name);
    ctx.fillRect(0, 0, w, h);
    const initial = (t.name?.trim()?.[0] || '?').toUpperCase();
    const d = Math.min(w, h) * 0.32;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, d, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.round(d)}px Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, w / 2, h / 2 + 1);
  }
  ctx.restore();

  // --- name + muted badge (only when the cell is wide enough) ---
  if (w > 78) {
    const grad = ctx.createLinearGradient(0, y + h - 30, 0, y + h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + h - 30, w, 30);

    const label = (t.name || '').replace(/\s*\(You\)$/, '');
    ctx.font = '500 12px Roboto, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#fff';
    ctx.fillText(truncate(ctx, label, w - 16), x + 8, y + h - 8);

    if (!t.audioOn) drawMutedBadge(ctx, x + w - 13, y + 13, 9);
  }

  ctx.restore();
}

function drawComposite(canvas, tiles, sources) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#202124';
  ctx.fillRect(0, 0, W, H);

  const list = tiles ?? [];
  const n = list.length;
  if (n === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 18px Outfit, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A-Meet', W / 2, H / 2);
    return;
  }

  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 6;
  const cellW = (W - gap * (cols + 1)) / cols;
  const cellH = (H - gap * (rows + 1)) / rows;

  list.forEach((t, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // Center a short final row so it doesn't hug the left edge.
    const inRow = Math.min(cols, n - r * cols);
    const rowOffset = (cols - inRow) * (cellW + gap) / 2;
    const cx = gap + rowOffset + c * (cellW + gap);
    const cy = gap + r * (cellH + gap);
    drawCell(ctx, t, sources.get(t.key)?.video, cx, cy, cellW, cellH);
  });
}

export function usePictureInPicture(tiles) {
  const [supported] = useState(detectSupport);
  const [active, setActive] = useState(false);

  // Live ref so the imperative draw loop always sees the latest tiles.
  const tilesRef = useRef(tiles);
  useEffect(() => { tilesRef.current = tiles; }, [tiles]);

  // The imperative controller lives in a mount-only effect and is reached
  // through this ref; everything dynamic is read via refs, so no stale state.
  const ctrlRef = useRef(null);

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

    const sources = new Map();
    let loop = 0;
    let capture = null;

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

    const start = async () => {
      try {
        if (!loop) { tick(); loop = window.setInterval(tick, TICK_MS); }
        if (!capture) { capture = canvas.captureStream(FPS); pipVideo.srcObject = capture; }
        // Don't `await` play(): awaiting can spend the transient user-gesture
        // activation that requestPictureInPicture() needs. Kick playback off,
        // and only wait if the video has no metadata yet (captureStream usually
        // resolves it within a frame, so the gesture is almost never lost).
        pipVideo.play().catch(() => {});
        if (pipVideo.readyState < HTMLMediaElement.HAVE_METADATA) {
          await new Promise((resolve) => {
            pipVideo.addEventListener('loadedmetadata', resolve, { once: true });
          });
        }
        await pipVideo.requestPictureInPicture();
        // `active` is flipped on by the enterpictureinpicture event.
      } catch (err) {
        teardownLoop();
        setActive(false);
        throw err;
      }
    };

    const stop = async () => {
      try {
        if (document.pictureInPictureElement === pipVideo) await document.exitPictureInPicture();
      } catch { /* ignore */ }
      teardownLoop();
      setActive(false);
    };

    const onEnter = () => setActive(true);
    const onLeave = () => { teardownLoop(); setActive(false); };
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

  const togglePiP = useCallback(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return Promise.reject(new Error('pip-unavailable'));
    return Promise.resolve(ctrl.toggle());
  }, []);

  return { pipSupported: supported, pipActive: active, togglePiP };
}

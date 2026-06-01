// Canvas compositing helpers shared by the Picture-in-Picture mini player and
// the in-call screenshot feature. These draw camera tiles (live video frames or
// camera-off avatar placeholders) onto a 2D canvas.
//
// Drawing MediaStream frames to canvas does NOT taint it (tainting only comes
// from cross-origin <img>/<video src>), so a captureStream()/toBlob() of the
// result stays usable.

import { getPeerColor } from './peer-color';

export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

// A small crossed-mic glyph drawn by hand (avoids platform emoji inconsistency).
export function drawMutedBadge(ctx, cx, cy, r) {
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
export function syncSources(tiles, sources, host) {
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

// Draw a single camera tile into (x, y, w, h): live frame ("cover") or a colored
// avatar placeholder, plus a name label + muted badge when wide enough.
// `objectFit` controls how a live frame is fitted — 'cover' (default) crops to
// fill, 'contain' letterboxes the whole frame (used for screen shares).
export function drawCell(ctx, t, video, x, y, w, h, { objectFit = 'cover', radius = 10 } = {}) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.clip();

  const hasVideo = t.videoOn && video && video.readyState >= 2 && video.videoWidth > 0;

  // --- video frame or off-cam placeholder (drawn in cell-local coords) ---
  ctx.save();
  ctx.translate(x, y);
  if (hasVideo) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = objectFit === 'contain'
      ? Math.min(w / vw, h / vh)
      : Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    if (objectFit === 'contain') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }
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

// Composite every camera tile onto the canvas in a centered grid.
export function drawComposite(canvas, tiles, sources) {
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

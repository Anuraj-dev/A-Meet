// In-call screenshot: composite the current camera tiles (and a screen share,
// if one is on stage) onto a high-resolution offscreen canvas and hand back a
// PNG blob. Used to copy the meeting view to the clipboard.
//
// We can't read pixels out of the live <video> elements in the React tree
// (matching them to the current layout is fragile), so we spin up our own
// hidden <video> per stream, wait briefly for a frame, draw, then tear down.

import { drawCell, drawComposite, roundRectPath, syncSources } from './video-composite';
import type { CompositeSource, CompositeTile } from './video-composite';

const OUT_W = 1280;
const OUT_H = 720;
// How long to wait for a freshly-attached <video> to produce a drawable frame.
const FRAME_TIMEOUT_MS = 700;

type ScreenshotTile = CompositeTile;

type ScreenshotShare = Pick<CompositeTile, 'key' | 'stream' | 'name'>;

type ScreenshotOptions = {
  tiles?: ScreenshotTile[];
  share?: ScreenshotShare | null;
};

// Resolve once the video has a frame ready to draw (readyState >= 2), or after a
// short timeout so a stalled stream can't hang the whole capture.
function waitForFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('loadeddata', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, FRAME_TIMEOUT_MS);
    video.addEventListener('loadeddata', finish, { once: true });
  });
}

// Presentation layout: big screen share on the left, camera strip on the right.
function drawShareLayout(
  canvas: HTMLCanvasElement,
  share: ScreenshotShare,
  tiles: ScreenshotTile[],
  sources: Map<string, CompositeSource>,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#202124';
  ctx.fillRect(0, 0, W, H);

  const gap = 10;
  const railW = tiles.length ? 248 : 0;
  const stageW = W - railW - gap * (railW ? 3 : 2);
  const stageH = H - gap * 2;

  drawCell(
    ctx,
    { name: share.name, videoOn: true, audioOn: true, mirror: false },
    sources.get(share.key)?.video,
    gap, gap, stageW, stageH,
    { objectFit: 'contain', radius: 14 },
  );

  if (!railW) return;
  const railX = gap * 2 + stageW;
  const visible = tiles.slice(0, 4);
  const cellH = (stageH - gap * (visible.length - 1)) / visible.length;
  visible.forEach((t, i) => {
    drawCell(ctx, t, sources.get(t.key)?.video, railX, gap + i * (cellH + gap), railW, cellH);
  });
  // "+N" chip when more cameras exist than the rail can show.
  const extra = tiles.length - visible.length;
  if (extra > 0) {
    const last = gap + (visible.length - 1) * (cellH + gap);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRectPath(ctx, railX + railW - 56, last + cellH - 34, 48, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 14px Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${extra}`, railX + railW - 32, last + cellH - 20);
    ctx.restore();
  }
}

// Build a PNG blob of the current meeting view.
//   tiles: camera tiles ({ key, stream, name, videoOn, audioOn, mirror })
//   share: optional on-stage screen share ({ key, stream, name })
export async function captureMeetingScreenshot({
  tiles = [],
  share = null,
}: ScreenshotOptions = {}): Promise<Blob> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(host);

  const sources = new Map<string, CompositeSource>();
  try {
    const shareTile = share ? { key: share.key, stream: share.stream } : null;
    const allTiles = shareTile ? [shareTile, ...tiles] : tiles;
    syncSources(allTiles, sources, host);

    // Give every freshly-attached video a moment to render a frame.
    await Promise.all(
      [...sources.values()].map((s) => waitForFrame(s.video)),
    );

    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    if (share) drawShareLayout(canvas, share, tiles, sources);
    else drawComposite(canvas, tiles, sources);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob-failed'))),
        'image/png',
      );
    });
  } finally {
    sources.forEach((s) => { s.video.srcObject = null; s.video.remove(); });
    sources.clear();
    host.remove();
  }
}

// Capture the meeting view and copy it to the clipboard as a PNG.
// Resolves with 'copied'. Throws if neither clipboard image-write nor the
// caller-supplied path can complete (caller decides on the fallback/messaging).
export async function copyMeetingScreenshot(opts?: ScreenshotOptions): Promise<'copied'> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('clipboard-image-unsupported');
  }
  // Pass the capture as a Promise<Blob> so clipboard.write() is invoked
  // synchronously within the user gesture (Safari requirement); Chrome/Firefox
  // accept this form too.
  const item = new ClipboardItem({ 'image/png': captureMeetingScreenshot(opts) });
  await navigator.clipboard.write([item]);
  return 'copied';
}

// Capture the meeting view and trigger a PNG file download (clipboard fallback).
export async function downloadMeetingScreenshot(
  opts?: ScreenshotOptions,
  filenameBase = 'a-meet',
): Promise<void> {
  const blob = await captureMeetingScreenshot(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}-${Date.now()}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

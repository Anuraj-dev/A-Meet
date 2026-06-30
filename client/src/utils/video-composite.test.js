import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drawComposite, syncSources, truncate } from './video-composite';

function createContextStub() {
  return {
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text) => ({ width: String(text).length * 10 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  };
}

describe('video composite utilities', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('truncates text to fit the available canvas width', () => {
    const ctx = createContextStub();

    expect(truncate(ctx, 'Participant', 55)).toBe('Part…');
    expect(truncate(ctx, 'Raja', 80)).toBe('Raja');
  });

  it('syncs hidden video sources and removes stale entries', () => {
    const host = document.createElement('div');
    const stream = {};
    const sources = new Map();

    syncSources([{ key: 'peer-1', stream }], sources, host);

    expect(sources.size).toBe(1);
    expect(host.querySelectorAll('video')).toHaveLength(1);
    expect(sources.get('peer-1').video.srcObject).toBe(stream);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    syncSources([], sources, host);

    expect(sources.size).toBe(0);
    expect(host.querySelectorAll('video')).toHaveLength(0);
  });

  it('draws the empty meeting placeholder when there are no camera tiles', () => {
    const ctx = createContextStub();
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 270;
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);

    drawComposite(canvas, [], new Map());

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 480, 270);
    expect(ctx.fillText).toHaveBeenCalledWith('A-Meet', 240, 135);
  });
});

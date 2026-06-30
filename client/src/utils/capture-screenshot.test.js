import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureMeetingScreenshot,
  copyMeetingScreenshot,
  downloadMeetingScreenshot,
} from './capture-screenshot';

const contextStub = {
  fillStyle: '',
  font: '',
  textAlign: '',
  textBaseline: '',
  fillRect: vi.fn(),
  fillText: vi.fn(),
};

describe('capture screenshot utilities', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contextStub);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback, type) {
      callback(new Blob(['png'], { type }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('captures the meeting view as a PNG blob and removes its hidden host', async () => {
    const before = document.body.childElementCount;

    const blob = await captureMeetingScreenshot();

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(document.body.childElementCount).toBe(before);
  });

  it('reports unsupported clipboard image writes before capturing', async () => {
    vi.stubGlobal('ClipboardItem', undefined);

    await expect(copyMeetingScreenshot()).rejects.toThrow('clipboard-image-unsupported');
  });

  it('downloads a PNG fallback with the requested filename prefix', async () => {
    const anchors = [];
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const element = createElement(tagName, options);
      if (tagName === 'a') anchors.push(element);
      return element;
    });
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:screenshot'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(Date, 'now').mockReturnValue(1234);

    await downloadMeetingScreenshot({}, 'a-meet-room');

    expect(anchors).toHaveLength(1);
    expect(anchors[0].href).toBe('blob:screenshot');
    expect(anchors[0].download).toBe('a-meet-room-1234.png');
    expect(HTMLElement.prototype.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:screenshot');
  });
});

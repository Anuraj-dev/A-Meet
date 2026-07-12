import { render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hook keeps a module-level shared AudioContext, so reset the module
// (and re-import) before every test to get a clean singleton.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type RafCb = FrameRequestCallback;

// Installs a controllable requestAnimationFrame: callbacks are queued, never
// auto-run, and `flushFrame` invokes the latest scheduled tick on demand.
function installControllableRaf() {
  let pending: RafCb | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: RafCb) => {
    pending = cb;
    return 1;
  });
  const cancel = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return {
    cancel,
    hasFrame: () => pending !== null,
    flushFrame: () => {
      const cb = pending;
      pending = null;
      if (cb) act(() => cb(0));
    },
  };
}

// A mock analyser whose time-domain data yields a fixed, non-zero RMS level.
function makeAudioMocks(sampleValue = 200) {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => arr.fill(sampleValue)),
  };
  class MockAudioContext {
    state = 'running';
    resume = vi.fn().mockResolvedValue(undefined);
    createMediaStreamSource = vi.fn(() => source);
    createAnalyser = vi.fn(() => analyser);
  }
  vi.stubGlobal('AudioContext', MockAudioContext as unknown as typeof AudioContext);
  // Ensure the webkit fallback branch is not accidentally picked up.
  vi.stubGlobal('webkitAudioContext', undefined);
  return { source, analyser };
}

// Fake stream exposing a single live audio track.
function makeStream(withTrack = true) {
  return {
    getAudioTracks: () => (withTrack ? [{ readyState: 'live' } as MediaStreamTrack] : []),
  } as unknown as MediaStream;
}

async function renderProbe(stream: MediaStream | null, enabled?: boolean) {
  const { useAudioLevel } = await import('./useAudioLevel');
  function Probe() {
    const ref = useAudioLevel<HTMLDivElement>(stream, enabled);
    return <div ref={ref} data-testid="meter" />;
  }
  const utils = render(<Probe />);
  const meter = utils.getByTestId('meter') as HTMLDivElement;
  return { ...utils, meter };
}

describe('useAudioLevel', () => {
  it('drives --lvl from the analyser RMS on each animation frame', async () => {
    const raf = installControllableRaf();
    makeAudioMocks(200); // -> level clamps to 1; first smoothed step = 0.5
    const { meter } = await renderProbe(makeStream(true), true);

    expect(raf.hasFrame()).toBe(true);
    raf.flushFrame();

    expect(meter.style.getPropertyValue('--lvl')).toBe('0.500');
  });

  it('wires the stream source into an analyser (never to a destination)', async () => {
    installControllableRaf();
    const { source, analyser } = makeAudioMocks();
    await renderProbe(makeStream(true), true);

    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(analyser.fftSize).toBe(256);
  });

  it('sets --lvl to 0 and does not meter when disabled', async () => {
    const raf = installControllableRaf();
    const mocks = makeAudioMocks();
    const { meter } = await renderProbe(makeStream(true), false);

    expect(meter.style.getPropertyValue('--lvl')).toBe('0');
    expect(raf.hasFrame()).toBe(false);
    expect(mocks.source.connect).not.toHaveBeenCalled();
  });

  it('sets --lvl to 0 when the stream has no audio track', async () => {
    const raf = installControllableRaf();
    makeAudioMocks();
    const { meter } = await renderProbe(makeStream(false), true);

    expect(meter.style.getPropertyValue('--lvl')).toBe('0');
    expect(raf.hasFrame()).toBe(false);
  });

  it('sets --lvl to 0 when no stream is provided', async () => {
    const raf = installControllableRaf();
    makeAudioMocks();
    const { meter } = await renderProbe(null, true);

    expect(meter.style.getPropertyValue('--lvl')).toBe('0');
    expect(raf.hasFrame()).toBe(false);
  });

  it('cancels the frame, disconnects nodes, and resets --lvl on unmount', async () => {
    const raf = installControllableRaf();
    const { source, analyser } = makeAudioMocks();
    const { meter, unmount } = await renderProbe(makeStream(true), true);

    raf.flushFrame();
    expect(meter.style.getPropertyValue('--lvl')).not.toBe('0');

    unmount();

    expect(raf.cancel).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    expect(analyser.disconnect).toHaveBeenCalled();
    expect(meter.style.getPropertyValue('--lvl')).toBe('0');
  });

  it('does not throw when AudioContext is unavailable', async () => {
    installControllableRaf();
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);

    await expect(renderProbe(makeStream(true), true)).resolves.toBeTruthy();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLifecycle } from '../src/lifecycle.js';

// Silent logger so the fatal/error paths don't spam the run.
const silentLogger = { info: vi.fn(), error: vi.fn(), fatal: vi.fn(), warn: vi.fn() };

// Build a lifecycle whose drain steps record their call order into `order`, with
// a mocked exit so nothing ever touches the real process.
function makeLifecycle(overrides = {}) {
  const order = [];
  const exit = vi.fn();
  const step = (name) => vi.fn(async () => { order.push(name); });
  const lc = createLifecycle({
    notifyRestart: step('notifyRestart'),
    closeSockets: step('closeSockets'),
    closeHttp: step('closeHttp'),
    closeWorkers: step('closeWorkers'),
    closeDb: step('closeDb'),
    logger: silentLogger,
    exit,
    drainTimeoutMs: 5_000,
    ...overrides,
  });
  return { lc, order, exit };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createLifecycle — clean drain', () => {
  it('runs every drain step in order then exits 0', async () => {
    const { lc, order, exit } = makeLifecycle();

    await lc.shutdown('SIGTERM');

    expect(order).toEqual([
      'notifyRestart',
      'closeSockets',
      'closeHttp',
      'closeWorkers',
      'closeDb',
    ]);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('is idempotent — a second signal is ignored', async () => {
    const closeDb = vi.fn(async () => {});
    const { lc, exit } = makeLifecycle({ closeDb });

    await lc.shutdown('SIGTERM');
    await lc.shutdown('SIGINT');

    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('skips missing steps and continues when a step throws', async () => {
    const order = [];
    const exit = vi.fn();
    const lc = createLifecycle({
      notifyRestart: undefined, // not provided — must be skipped, not crash
      closeSockets: vi.fn(async () => { throw new Error('socket boom'); }),
      closeHttp: vi.fn(async () => { order.push('closeHttp'); }),
      logger: silentLogger,
      exit,
    });

    await lc.shutdown('SIGTERM');

    // A failing/absent step does not abort the drain or change the exit code.
    expect(order).toEqual(['closeHttp']);
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe('createLifecycle — forced timeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('force-exits 1 when a drain step hangs past the timeout', async () => {
    const exit = vi.fn();
    // closeSockets never resolves, so the drain wedges.
    const lc = createLifecycle({
      notifyRestart: vi.fn(async () => {}),
      closeSockets: () => new Promise(() => {}),
      logger: silentLogger,
      exit,
      drainTimeoutMs: 1_000,
    });

    lc.shutdown('SIGTERM'); // do not await — it hangs by design
    await vi.advanceTimersByTimeAsync(1_000);

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('createLifecycle — fatal errors', () => {
  it('logs fatal and exits 1', () => {
    const exit = vi.fn();
    const lc = createLifecycle({ logger: silentLogger, exit });

    lc.handleFatal(new Error('kaboom'), 'uncaughtException');

    expect(silentLogger.fatal).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('createLifecycle — register/unregister', () => {
  it('wires process signals to the lifecycle and unregister removes them', async () => {
    const exit = vi.fn();
    const lc = createLifecycle({
      notifyRestart: vi.fn(async () => {}),
      closeSockets: vi.fn(async () => {}),
      closeHttp: vi.fn(async () => {}),
      logger: silentLogger,
      exit,
    });

    const before = process.listenerCount('SIGTERM');
    const unregister = lc.register();
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);

    // The registered SIGTERM handler should drive a graceful shutdown (exit 0).
    process.emit('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    unregister();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });

  it('unregister removes the fatal-error listeners too', () => {
    const lc = createLifecycle({ logger: silentLogger, exit: vi.fn() });
    const before = {
      uncaught: process.listenerCount('uncaughtException'),
      rejection: process.listenerCount('unhandledRejection'),
      sigint: process.listenerCount('SIGINT'),
    };

    const unregister = lc.register();
    unregister();

    expect(process.listenerCount('uncaughtException')).toBe(before.uncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(before.rejection);
    expect(process.listenerCount('SIGINT')).toBe(before.sigint);
  });
});

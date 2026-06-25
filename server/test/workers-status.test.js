import { describe, it, expect, vi } from 'vitest';

// Stub mediasoup so importing the real worker module never loads its native
// worker binary (not built under CI's `npm ci --ignore-scripts`). These tests
// exercise the pure pool-status logic, which never calls createWorker().
vi.mock('mediasoup', () => ({ createWorker: vi.fn() }));

import { areWorkersAlive, getWorker, closeWorkers } from '../src/sfu/workers.js';

describe('mediasoup worker pool status (no pool created)', () => {
  it('areWorkersAlive() is false before the pool is created', () => {
    expect(areWorkersAlive()).toBe(false);
  });

  it('getWorker() throws when the pool is not initialized', () => {
    expect(() => getWorker()).toThrow(/not initialized/);
  });

  it('closeWorkers() is a safe no-op on an empty pool and stays not-ready', async () => {
    await closeWorkers();
    expect(areWorkersAlive()).toBe(false);
  });
});

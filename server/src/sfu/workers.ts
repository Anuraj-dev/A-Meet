// mediasoup Worker pool (M4). A Worker is a C++ subprocess that does the real
// media work (DTLS/SRTP/RTP); it's single-threaded, so we run one per CPU core
// and round-robin Routers across them to spread load.

import os from 'os';
import * as mediasoup from 'mediasoup';
import type { types as MediasoupTypes } from 'mediasoup';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { workerSettings } from './config.js';

const workers: MediasoupTypes.Worker[] = [];
let nextWorkerIdx = 0;
// Latched true once any worker emits 'died'. The process exits 2s later, but in
// that window the readiness probe must already report not-ready so the deploy
// gate / auto-recovery alarm see it. Reset on a clean (re)build of the pool.
let aWorkerDied = false;

// Spin up the pool once at server startup (before httpServer.listen).
export async function createWorkers() {
  aWorkerDied = false;
  const count = env.mediasoup.numWorkers || os.cpus().length;
  for (let i = 0; i < count; i++) {
    const worker = await mediasoup.createWorker(workerSettings);

    // A dead Worker is unrecoverable — every Router/transport on it is gone.
    // Crash loudly so a process manager restarts us clean.
    worker.on('died', () => {
      aWorkerDied = true;
      logger.fatal({ pid: worker.pid }, 'mediasoup worker died — exiting in 2s');
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);
  }
  logger.info(
    { count: workers.length, minPort: workerSettings.rtcMinPort, maxPort: workerSettings.rtcMaxPort },
    'mediasoup workers ready',
  );
}

// Readiness accessor for the deep health probe. True only when the pool has
// been created and no worker has died — without exposing mediasoup internals
// (Worker objects, pids) to the route layer.
export function areWorkersAlive() {
  return workers.length > 0 && !aWorkerDied;
}

// Round-robin so consecutive rooms land on different Workers/cores.
export function getWorker() {
  if (workers.length === 0) throw new Error('mediasoup workers not initialized');
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

// Tear the whole pool down on shutdown. worker.close() cascades to every Router
// and transport on it, so this frees all media resources. Closing is deliberate
// (not a crash), so it never trips the 'died' handler above. Idempotent.
export async function closeWorkers() {
  for (const worker of workers) {
    try { worker.close(); } catch { /* already closed */ }
  }
  workers.length = 0;
  nextWorkerIdx = 0;
  aWorkerDied = false;
}

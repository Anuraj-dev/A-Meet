// mediasoup Worker pool (M4). A Worker is a C++ subprocess that does the real
// media work (DTLS/SRTP/RTP); it's single-threaded, so we run one per CPU core
// and round-robin Routers across them to spread load.

import os from 'os';
import * as mediasoup from 'mediasoup';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { workerSettings } from './config.js';

const workers = [];
let nextWorkerIdx = 0;

// Spin up the pool once at server startup (before httpServer.listen).
export async function createWorkers() {
  const count = env.mediasoup.numWorkers || os.cpus().length;
  for (let i = 0; i < count; i++) {
    const worker = await mediasoup.createWorker(workerSettings);

    // A dead Worker is unrecoverable — every Router/transport on it is gone.
    // Crash loudly so a process manager restarts us clean.
    worker.on('died', () => {
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

// Round-robin so consecutive rooms land on different Workers/cores.
export function getWorker() {
  if (workers.length === 0) throw new Error('mediasoup workers not initialized');
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

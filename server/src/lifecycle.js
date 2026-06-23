// Server lifecycle (crash-safe shutdown + fatal-error handling).
//
// On EC2 the box is restarted/redeployed routinely, and mediasoup Workers are
// C++ subprocesses that must be closed so RTP ports are freed for the next boot.
// This module turns an abrupt `kill` into an orderly drain: tell clients we're
// going away, stop accepting connections, close media + HTTP + DB, then exit 0.
// If any step hangs, a hard timer force-exits so we never wedge a stuck process.
//
// Everything is dependency-injected (the close steps, the logger, the `exit`
// function, the timeout) so the observable contract — order of drain, clean vs.
// forced exit, fatal-exit code — can be tested without real sockets/processes.

import { logger as defaultLogger } from './config/logger.js';

// How long graceful drain gets before we stop waiting and force-exit.
export const DEFAULT_DRAIN_TIMEOUT_MS = 10_000;

export function createLifecycle({
  // Notify connected clients that the server is restarting (best-effort).
  notifyRestart,
  // Stop accepting / disconnect existing socket connections.
  closeSockets,
  // Drain and close the HTTP server (resolves once in-flight requests finish).
  closeHttp,
  // Tear down the mediasoup Worker pool.
  closeWorkers,
  // Disconnect from MongoDB.
  closeDb,
  logger = defaultLogger,
  exit = process.exit,
  drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
} = {}) {
  let shuttingDown = false;

  // Run one drain step, tolerating a missing dep and logging (not throwing) on
  // failure so a single broken step still lets the rest of the drain proceed.
  async function runStep(name, fn) {
    if (typeof fn !== 'function') return;
    try {
      await fn();
    } catch (err) {
      logger.error({ err, step: name }, 'Drain step failed — continuing');
    }
  }

  async function shutdown(signal) {
    if (shuttingDown) return; // ignore repeat/duplicate signals
    shuttingDown = true;
    logger.info({ signal, drainTimeoutMs }, 'Shutdown signal received — draining');

    // Safety net: if drain hangs, force-exit non-zero rather than wedge forever.
    // unref so this timer alone can't keep the event loop alive.
    const forceTimer = setTimeout(() => {
      logger.fatal({ signal, drainTimeoutMs }, 'Graceful drain timed out — forcing exit');
      exit(1);
    }, drainTimeoutMs);
    if (typeof forceTimer.unref === 'function') forceTimer.unref();

    // Order matters: warn clients first, then stop new sockets, drain HTTP,
    // free media Workers, and finally close the DB.
    await runStep('notifyRestart', notifyRestart);
    await runStep('closeSockets', closeSockets);
    await runStep('closeHttp', closeHttp);
    await runStep('closeWorkers', closeWorkers);
    await runStep('closeDb', closeDb);

    clearTimeout(forceTimer);
    logger.info({ signal }, 'Drain complete — exiting cleanly');
    exit(0);
  }

  // A fatal error means in-memory media/socket state is no longer trustworthy.
  // Log it and terminate so the supervisor restarts us clean, rather than limp
  // along in a corrupt state.
  function handleFatal(err, origin) {
    logger.fatal({ err, origin }, 'Fatal error — terminating process');
    exit(1);
  }

  // Attach process handlers. Returns an unregister() that removes exactly the
  // handlers we added (used by tests to avoid leaking listeners / hijacking the
  // runner's own signal handling).
  function register() {
    const onSigterm = () => shutdown('SIGTERM');
    const onSigint = () => shutdown('SIGINT');
    const onUncaught = (err) => handleFatal(err, 'uncaughtException');
    const onRejection = (reason) => handleFatal(reason, 'unhandledRejection');

    process.on('SIGTERM', onSigterm);
    process.on('SIGINT', onSigint);
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onRejection);

    return function unregister() {
      process.removeListener('SIGTERM', onSigterm);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('uncaughtException', onUncaught);
      process.removeListener('unhandledRejection', onRejection);
    };
  }

  return {
    shutdown,
    handleFatal,
    register,
    get isShuttingDown() {
      return shuttingDown;
    },
  };
}

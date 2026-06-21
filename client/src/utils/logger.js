// Client-side batched logger. Buffers entries and flushes to the API backend's
// /api/logs/client endpoint every 5 seconds or when the buffer reaches 20 entries.
// Uses navigator.sendBeacon on page hide for zero-loss unload flush.

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER = 20;

export function resolveClientLogEndpoint(serverUrl = import.meta.env.VITE_SERVER_URL) {
  if (!serverUrl) return '/api/logs/client';
  return `${serverUrl.replace(/\/$/, '')}/api/logs/client`;
}

const ENDPOINT = resolveClientLogEndpoint();

// Stable per-session correlation ID so client and server logs for the same
// browser session can be joined in Grafana / grepped in the log file.
const sessionId = (() => {
  try {
    let id = sessionStorage.getItem('_ls');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('_ls', id); }
    return id;
  } catch { return 'unknown'; }
})();

let buffer = [];
let flushTimer = null;

function sendBatch(entries) {
  const payload = JSON.stringify({ logs: entries });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch { /* never throw from logger */ }
}

function flush() {
  if (buffer.length === 0) return;
  sendBatch(buffer.splice(0));
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_INTERVAL_MS);
}

function log(level, msg, data = {}) {
  buffer.push({ level, msg, sessionId, ts: new Date().toISOString(), url: location.pathname, ...data });
  if (buffer.length >= MAX_BUFFER) flush();
  else scheduleFlush();
}

// Flush on tab hide / page unload
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', flush);

// Global uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  log('error', String(message), { source, lineno, colno, stack: error?.stack?.slice(0, 800) });
};
window.onunhandledrejection = (event) => {
  log('error', 'Unhandled promise rejection', { reason: String(event.reason).slice(0, 400) });
};

export const appLogger = {
  debug: (msg, data) => log('debug', msg, data),
  info:  (msg, data) => log('info',  msg, data),
  warn:  (msg, data) => log('warn',  msg, data),
  error: (msg, data) => log('error', msg, data),
};

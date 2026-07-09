// Promisified Socket.io request/response for SFU signaling (M4).
//
// Every mediasoup signaling step is a round-trip: emit an event, await the
// server's ack. This wraps that pattern so the useMediasoup hook can `await
// request(...)` instead of nesting callbacks. The server's ack is either the
// result or `{ error }`.
//
// A failed round-trip has three distinct causes and we surface each as its own
// `SignalError.reason` instead of the old blanket "timed out" (that mislabel
// pointed weeks of debugging at TURN when the real cause was a socket that
// dropped mid-handshake). We also attach `socketConnected` and `elapsedMs` so
// logs/alarms can tell an honest 10s timeout from a sub-second disconnect:
//   - 'disconnect' — the socket.io error fired while the socket was down.
//   - 'timeout'    — the socket.io error fired while still connected (real ack timeout).
//   - 'server'     — the ack carried an `{ error }` payload (server rejection).

import socket from './socket';
import type {
  SfuRequestEvent,
  SfuRequestPayload,
  SfuRequestResponse,
  SocketAck,
  SocketAckError,
} from '@a-meet/contracts';

type RequestArgs<E extends SfuRequestEvent> = E extends 'sfu-get-producers'
  ? [data?: SfuRequestPayload<E>, timeoutMs?: number]
  : [data: SfuRequestPayload<E>, timeoutMs?: number];

type SfuTimedEmit = <E extends SfuRequestEvent>(
  event: E,
  payload: SfuRequestPayload<E>,
  callback: (err: Error, response: SocketAck<SfuRequestResponse<E>>) => void,
) => void;

export type SignalErrorReason = 'timeout' | 'disconnect' | 'server';

// Distinct, inspectable failure carrying the real cause plus the two facts that
// let a reader trust the label: was the socket up, and how long did we wait.
export class SignalError extends Error {
  readonly reason: SignalErrorReason;
  readonly event: string;
  readonly socketConnected: boolean;
  readonly elapsedMs: number;

  constructor(
    message: string,
    details: { reason: SignalErrorReason; event: string; socketConnected: boolean; elapsedMs: number },
  ) {
    super(message);
    this.name = 'SignalError';
    this.reason = details.reason;
    this.event = details.event;
    this.socketConnected = details.socketConnected;
    this.elapsedMs = details.elapsedMs;
  }
}

function isAckError(response: SocketAck<unknown>): response is SocketAckError {
  return typeof response === 'object' && response !== null && 'error' in response;
}

export function request<E extends SfuRequestEvent>(
  event: E,
  ...[data, timeoutMs = 10000]: RequestArgs<E>
): Promise<SfuRequestResponse<E>> {
  const payload = (data ?? {}) as SfuRequestPayload<E>;
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const timedSocket = socket.timeout(timeoutMs);
    // Socket.IO loses the payload/ack correlation for a generic event key.
    const emit = timedSocket.emit.bind(timedSocket) as SfuTimedEmit;
    emit(event, payload, (
      err: Error,
      response: SocketAck<SfuRequestResponse<E>>,
    ) => {
      const elapsedMs = Date.now() - startedAt;
      if (err) {
        // socket.io fires an error both on a genuine ack timeout and when the
        // socket is down. `socket.connected` at callback time is the honest
        // discriminator: a request that "timed out" in 200ms is really a drop.
        const connected = socket.connected;
        if (!connected) {
          return reject(new SignalError(
            `${event} failed: socket disconnected after ${elapsedMs}ms`,
            { reason: 'disconnect', event, socketConnected: false, elapsedMs },
          ));
        }
        return reject(new SignalError(
          `${event} timed out after ${elapsedMs}ms`,
          { reason: 'timeout', event, socketConnected: true, elapsedMs },
        ));
      }
      if (isAckError(response)) {
        return reject(new SignalError(response.error, {
          reason: 'server',
          event,
          socketConnected: socket.connected,
          elapsedMs,
        }));
      }
      resolve(response);
    });
  });
}

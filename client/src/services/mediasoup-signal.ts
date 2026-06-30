// Promisified Socket.io request/response for SFU signaling (M4).
//
// Every mediasoup signaling step is a round-trip: emit an event, await the
// server's ack. This wraps that pattern so the useMediasoup hook can `await
// request(...)` instead of nesting callbacks. The server's ack is either the
// result or `{ error }`; we reject on `error` (and on ack timeout, so a lost
// reply surfaces instead of hanging the negotiation forever).

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

function isAckError(response: SocketAck<unknown>): response is SocketAckError {
  return typeof response === 'object' && response !== null && 'error' in response;
}

export function request<E extends SfuRequestEvent>(
  event: E,
  ...[data, timeoutMs = 10000]: RequestArgs<E>
): Promise<SfuRequestResponse<E>> {
  const payload = (data ?? {}) as SfuRequestPayload<E>;
  return new Promise((resolve, reject) => {
    const timedSocket = socket.timeout(timeoutMs);
    // Socket.IO loses the payload/ack correlation for a generic event key.
    const emit = timedSocket.emit.bind(timedSocket) as SfuTimedEmit;
    emit(event, payload, (
      err: Error,
      response: SocketAck<SfuRequestResponse<E>>,
    ) => {
      if (err) return reject(new Error(`${event} timed out`));
      if (isAckError(response)) return reject(new Error(response.error));
      resolve(response);
    });
  });
}

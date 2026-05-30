// Promisified Socket.io request/response for SFU signaling (M4).
//
// Every mediasoup signaling step is a round-trip: emit an event, await the
// server's ack. This wraps that pattern so the useMediasoup hook can `await
// request(...)` instead of nesting callbacks. The server's ack is either the
// result or `{ error }`; we reject on `error` (and on ack timeout, so a lost
// reply surfaces instead of hanging the negotiation forever).

import socket from './socket';

export function request(event, data = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, data, (err, response) => {
      if (err) return reject(new Error(`${event} timed out`));
      if (response && response.error) return reject(new Error(response.error));
      resolve(response);
    });
  });
}

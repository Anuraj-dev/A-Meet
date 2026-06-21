export function queuePendingProducer(queue, info) {
  if (!info?.producerId) return;
  queue.set(info.producerId, info);
}

export function drainPendingProducers(queue) {
  const pending = [...queue.values()];
  queue.clear();
  return pending;
}

export function dropPendingProducersForSocket(queue, socketId) {
  for (const [producerId, info] of queue.entries()) {
    if (info.socketId === socketId) queue.delete(producerId);
  }
}

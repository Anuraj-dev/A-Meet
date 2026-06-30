import type { SfuProducerDescriptor } from '@a-meet/contracts';

type PendingProducerQueue = Map<string, SfuProducerDescriptor>;

export function queuePendingProducer(
  queue: PendingProducerQueue,
  info: SfuProducerDescriptor | null | undefined,
) {
  if (!info?.producerId) return;
  queue.set(info.producerId, info);
}

export function drainPendingProducers(queue: PendingProducerQueue) {
  const pending = [...queue.values()];
  queue.clear();
  return pending;
}

export function dropPendingProducersForSocket(queue: PendingProducerQueue, socketId: string) {
  for (const [producerId, info] of queue.entries()) {
    if (info.socketId === socketId) queue.delete(producerId);
  }
}

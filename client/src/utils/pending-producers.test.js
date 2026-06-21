import { describe, expect, it } from 'vitest';
import {
  drainPendingProducers,
  dropPendingProducersForSocket,
  queuePendingProducer,
} from './pending-producers';

describe('pending producer queue', () => {
  it('deduplicates by producer id and preserves the latest payload', () => {
    const queue = new Map();

    queuePendingProducer(queue, { producerId: 'p-1', socketId: 's-1', kind: 'audio' });
    queuePendingProducer(queue, { producerId: 'p-1', socketId: 's-1', kind: 'video' });

    expect(drainPendingProducers(queue)).toEqual([
      { producerId: 'p-1', socketId: 's-1', kind: 'video' },
    ]);
  });

  it('drops queued producers for a peer that left before consumption', () => {
    const queue = new Map();
    queuePendingProducer(queue, { producerId: 'p-1', socketId: 's-1' });
    queuePendingProducer(queue, { producerId: 'p-2', socketId: 's-2' });

    dropPendingProducersForSocket(queue, 's-1');

    expect(drainPendingProducers(queue)).toEqual([
      { producerId: 'p-2', socketId: 's-2' },
    ]);
  });
});

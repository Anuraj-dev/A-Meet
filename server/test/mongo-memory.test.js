import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Room } from '../src/models/Room.js';
import { useMongoMemoryServer } from './helpers/mongo.js';

// Proof test for the shared in-memory Mongo helper (#72). It does not test the
// Room model itself — it proves the helper gives a suite a real, writable
// Mongoose connection with no external database, and that state is isolated
// between tests. The actual controller/route suites land in #36.
describe('mongodb-memory-server helper', () => {
  useMongoMemoryServer();

  it('persists and reads a document back through a real Mongoose model', async () => {
    const hostId = new mongoose.Types.ObjectId();
    await Room.create({ roomId: 'abc-defg-hij', host: hostId });

    const found = await Room.findOne({ roomId: 'abc-defg-hij' });
    expect(found).not.toBeNull();
    expect(found.host.toString()).toBe(hostId.toString());
    // Schema defaults are applied, confirming this is a genuine model round-trip.
    expect(found.active).toBe(true);
  });

  it('starts each test with a clean database (isolation between tests)', async () => {
    // The previous test created a Room; afterEach should have cleared it.
    expect(await Room.countDocuments()).toBe(0);
  });
});

import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Wire a throwaway in-memory MongoDB into the calling test suite.
 *
 * Call once at the top of a `describe` block (or a test module's top level).
 * It registers Vitest lifecycle hooks that:
 *   - boot a disposable `mongod` and connect Mongoose before the suite runs,
 *   - delete every document between tests so each test starts clean,
 *   - disconnect Mongoose and stop `mongod` after the suite finishes.
 *
 * No external Mongo is required, so controller/route suites can exercise real
 * Mongoose models without a running database.
 *
 * Binary download: on first use mongodb-memory-server fetches a matching
 * `mongod` binary into its cache (~/.cache/mongodb-binaries) from
 * fastdl.mongodb.org, then reuses it on later runs. That fetch is a *runtime*
 * step performed by the test, not an npm postinstall — so it is unaffected by
 * CI's `npm ci --ignore-scripts` and keeps installs fast. The first CI run on
 * a cold cache pays the one-time download.
 */
export function useMongoMemoryServer() {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterEach(async () => {
    // Drop all documents between tests so state never leaks across cases,
    // without paying to restart mongod each time.
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod?.stop();
  });
}

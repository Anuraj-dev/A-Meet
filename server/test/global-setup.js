import { MongoBinary } from 'mongodb-memory-server';

/**
 * Fetch the `mongod` binary once, before any test file runs.
 *
 * On a cold cache (every fresh CI runner) each suite that calls
 * `useMongoMemoryServer` would otherwise start the ~100 MB download inside its
 * own `beforeAll`, in parallel workers that contend for the same lock file.
 * The download outlives the 10 s hook timeout, so those suites fail at random
 * depending on network speed. Global setup has no hook timeout and runs before
 * the workers start, so the suites only ever find a warm cache.
 */
export default async function setup() {
  await MongoBinary.getPath();
}

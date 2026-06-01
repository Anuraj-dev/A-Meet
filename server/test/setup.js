// Runs before any test module is imported. config/env.js calls process.exit(1)
// when MONGO_URI / JWT_SECRET are missing, so we provide deterministic defaults
// here. In local dev server/.env supplies real values (these ||= no-op); in CI
// there is no .env, so these defaults keep env.js from crashing the run.
process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.MONGO_URI ||= 'mongodb://localhost:27017/ameet-test';
process.env.NODE_ENV ||= 'test';

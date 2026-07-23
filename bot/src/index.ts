import 'dotenv/config';
import { loadBotEnv } from './config/env.js';
import { startBot } from './bot.js';

// Process entrypoint. Loads .env (no-op in prod where SSM/compose inject env),
// validates config, then logs the gateway client in. A missing-config or login
// failure exits non-zero so the container's `restart: always` doesn't spin on a
// silently-broken process.
async function main(): Promise<void> {
  const config = loadBotEnv();
  await startBot(config);
}

main().catch((err) => {
  console.error('Bot failed to start:', err);
  process.exit(1);
});

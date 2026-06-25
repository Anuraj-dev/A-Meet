// Two-context peer helper: the core primitive for multi-participant E2E
// scenarios (presence, host-mute, remove, spotlight, chat, reactions in #35).
// Each peer is an isolated BrowserContext — separate cookies/storage — so two
// "users" can be driven in one test, optionally pre-authenticated via stubAuth.
import { stubAuth } from './auth.js';

// Opens two independent browser contexts (+a page each). Pass `{ users: [a, b] }`
// to pre-stub auth for each peer. Returns the contexts, pages, and a `close()`
// that disposes both contexts.
export async function createPeers(browser, { users } = {}) {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  if (users) {
    await stubAuth(contextA, users[0]);
    await stubAuth(contextB, users[1]);
  }

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  async function close() {
    await contextA.close();
    await contextB.close();
  }

  return { contextA, contextB, pageA, pageB, close };
}

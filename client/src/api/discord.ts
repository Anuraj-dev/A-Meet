import api from './axios';
import type { DiscordLinkResponse } from '@a-meet/contracts';

// Exchange a single-purpose link token (from a Discord `/meet link` DM) for a
// persisted Discord↔account mapping. The auth cookie identifies the account;
// resolves on success, throws (like axios) on a non-2xx — a 400 means the token
// is invalid or expired.
export async function linkDiscord(token: string): Promise<void> {
  await api.post<DiscordLinkResponse>('/integrations/discord/link', { token });
}

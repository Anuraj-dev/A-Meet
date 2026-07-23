import type {
  DiscordLinkTokenResponse,
  DiscordRoomResponse,
  DiscordNotLinkedError,
} from '@a-meet/contracts';

// Typed HTTP client wrapping the two bot-facing A-Meet integration endpoints.
// The bot holds no meeting logic — this is the whole surface it talks to the
// server through. Errors are modelled as typed throws so command handlers can
// route replies (link prompt vs generic error) without string-matching.

/** The A-Meet account for this Discord id has not been linked yet. */
export class NotLinkedError extends Error {
  constructor(message = 'Discord account is not linked') {
    super(message);
    this.name = 'NotLinkedError';
  }
}

/** The server answered with a non-success status we can't specifically handle. */
export class IntegrationHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'IntegrationHttpError';
    this.status = status;
  }
}

/** Minimal fetch surface, injectable so tests don't touch the global. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export interface IntegrationClientOptions {
  /** Base URL of the API server, e.g. http://localhost:5000 (no trailing slash needed). */
  serverUrl: string;
  /** Shared bot API key sent in the X-Bot-Api-Key header. */
  apiKey: string;
  /** Override the fetch implementation (defaults to global fetch). */
  fetchImpl?: FetchLike;
}

const BOT_API_KEY_HEADER = 'X-Bot-Api-Key';

export class DiscordIntegrationClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: IntegrationClientOptions) {
    // Normalise so `${base}/api/...` never produces a double slash.
    this.baseUrl = options.serverUrl.replace(/\/+$/, '') + '/api/integrations/discord';
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  private async post(path: string, body: unknown): Promise<{ status: number; ok: boolean; data: unknown }> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [BOT_API_KEY_HEADER]: this.apiKey,
      },
      body: JSON.stringify(body),
    });
    let data: unknown = undefined;
    try {
      data = await res.json();
    } catch {
      // Non-JSON bodies (e.g. a proxy 502) leave data undefined; handled below.
    }
    return { status: res.status, ok: res.ok, data };
  }

  /** Mint a short-lived account-link token + ready-made confirmation URL. */
  async createLinkToken(discordId: string): Promise<DiscordLinkTokenResponse> {
    const { status, ok, data } = await this.post('/link-token', { discordId });
    if (!ok) {
      throw new IntegrationHttpError(status, `link-token failed (${status})`);
    }
    return data as DiscordLinkTokenResponse;
  }

  /**
   * Create an instant room hosted by the linked A-Meet user.
   * @throws NotLinkedError when the Discord id has no linked account (404 + code).
   * @throws IntegrationHttpError for any other non-success response.
   */
  async createRoom(discordId: string): Promise<DiscordRoomResponse> {
    const { status, ok, data } = await this.post('/rooms', { discordId });
    if (ok) {
      return data as DiscordRoomResponse;
    }
    if (status === 404 && (data as DiscordNotLinkedError | undefined)?.code === 'not_linked') {
      throw new NotLinkedError();
    }
    throw new IntegrationHttpError(status, `rooms failed (${status})`);
  }
}

// REST DTO contracts shared by the client and server. The server returns these
// shapes from its room endpoints; the client consumes them. Sharing the type
// keeps request/response handling honest across the wire.

/**
 * A meeting room as returned by the room REST endpoints
 * (e.g. `POST /api/rooms` and `GET /api/rooms/:id`).
 */
export interface RoomDto {
  /** Short, shareable room code — the segment used in the meeting URL. */
  id: string;
  /** User id of the room host/owner. */
  hostId: string;
  /** ISO-8601 timestamp of when the room was created. */
  createdAt: string;
  /** Whether the room currently has an active session. */
  active: boolean;
}

/** Request body for reserving a scheduled meeting. */
export interface ScheduleMeetingRequest {
  title: string;
  scheduledFor: string;
  description?: string;
}

/** Editable fields on an existing scheduled meeting. */
export type UpdateScheduledMeetingRequest = Partial<ScheduleMeetingRequest>;

/** A scheduled meeting returned by the room REST endpoints. */
export interface ScheduledMeetingDto {
  roomId: string;
  title: string;
  description?: string;
  scheduledFor: string;
  createdAt: string;
}

/** Response body for the signed-in user's scheduled meetings. */
export interface MeetingsResponse {
  meetings: ScheduledMeetingDto[];
}

export interface AuthUserDto {
  id: string;
  name?: string;
  email?: string;
  avatar?: string;
}

// ── Discord integration contracts ─────────────────────────────────────────
// Consumed by the Discord bot (ticket 2) and the client `/link/discord` page.

/** Body for `POST /api/integrations/discord/link-token` (bot-key auth). */
export interface DiscordLinkTokenRequest {
  discordId: string;
}

/** Response of `POST /api/integrations/discord/link-token`. */
export interface DiscordLinkTokenResponse {
  /** Short-lived, single-purpose JWT bound to the Discord ID. */
  token: string;
  /** Ready-made confirmation URL the bot DMs to the user. */
  linkUrl: string;
}

/** Body for `POST /api/integrations/discord/link` (user cookie auth). */
export interface DiscordLinkRequest {
  token: string;
}

/** Response of `POST /api/integrations/discord/link`. */
export interface DiscordLinkResponse {
  ok: true;
}

/** Body for `POST /api/integrations/discord/rooms` (bot-key auth). */
export interface DiscordRoomRequest {
  discordId: string;
}

/** Response of `POST /api/integrations/discord/rooms` — matches `POST /api/rooms`. */
export interface DiscordRoomResponse {
  roomId: string;
}

/**
 * Error body returned by `POST /api/integrations/discord/rooms` when the given
 * `discordId` has no linked A-Meet account. The `code` lets the bot detect this
 * specific case (vs a generic failure) and prompt the user to run `/meet link`.
 */
export interface DiscordNotLinkedError {
  error: string;
  code: 'not_linked';
}

export interface AuthMeResponse {
  user: AuthUserDto | null;
}

export interface RoomIdentityDto {
  _id: string;
  /** Mongoose/serialization compatibility alias used by older room payloads. */
  id?: string;
  name?: string;
  avatar?: string;
}

export interface RoomMetadataDto {
  roomId: string;
  host?: RoomIdentityDto | null;
  admin?: RoomIdentityDto | null;
  active: boolean;
  title?: string;
  description?: string;
  scheduledFor?: string;
  createdAt?: string;
}

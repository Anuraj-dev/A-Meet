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

export interface AuthMeResponse {
  user: AuthUserDto | null;
}

export interface RoomMetadataDto {
  roomId: string;
  host?: AuthUserDto | null;
  admin?: AuthUserDto | null;
  active: boolean;
  title?: string;
  description?: string;
  scheduledFor?: string;
  createdAt?: string;
}

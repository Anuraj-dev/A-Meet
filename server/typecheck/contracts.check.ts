// Proves the server resolves and type-checks against the shared @a-meet/contracts
// package. This stands in for real producers until server modules are migrated to
// TypeScript (see docs/typescript-migration.md); the strict compiler will reject
// any payload that drifts from the shared contract.

import {
  SocketEvent,
  type HandRaisedPayload,
  type RoomDto,
} from '@a-meet/contracts';

/** Construct the payload the server broadcasts when a hand is raised/lowered. */
export function buildHandRaisedPayload(
  participantId: string,
  displayName: string,
  raised: boolean,
): HandRaisedPayload {
  return { participantId, displayName, raised, at: Date.now() };
}

/** Serialize a room document into the REST response DTO. */
export function toRoomDto(room: {
  id: string;
  hostId: string;
  createdAt: Date;
  active: boolean;
}): RoomDto {
  return {
    id: room.id,
    hostId: room.hostId,
    createdAt: room.createdAt.toISOString(),
    active: room.active,
  };
}

/** The event name the server emits raise-hand updates under. */
export const HAND_RAISED_EVENT = SocketEvent.HandRaised;

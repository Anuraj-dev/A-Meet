// Proves the client resolves and type-checks against the shared @a-meet/contracts
// package. This stands in for real consumers until client modules are migrated to
// TypeScript (see docs/typescript-migration.md); the strict compiler will reject
// any payload that drifts from the shared contract.

import {
  SocketEvent,
  type HandRaisedPayload,
  type RoomDto,
} from '@a-meet/contracts';

/** Map a raise-hand broadcast into the toast text the UI shows. */
export function handRaisedToast(payload: HandRaisedPayload): string {
  return payload.raised
    ? `${payload.displayName} raised their hand`
    : `${payload.displayName} lowered their hand`;
}

/** Build the meeting share link for a room returned by the REST API. */
export function roomShareLabel(room: RoomDto): string {
  return room.active ? `Join ${room.id}` : `Room ${room.id} (ended)`;
}

/** The event name the client subscribes to for raise-hand updates. */
export const HAND_RAISED_EVENT = SocketEvent.HandRaised;

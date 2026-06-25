// Socket.io contracts shared by the client and server. Keeping the event names
// and payload shapes in one place stops the two ends from drifting as features
// land — the compiler flags a mismatch the moment one side changes.

/**
 * Canonical Socket.io event names. Both ends import these constants instead of
 * hand-typing the string, so a rename is a single edit the compiler enforces.
 */
export const SocketEvent = {
  /** A participant raised or lowered their hand (M5 raise-hand feature). */
  HandRaised: 'hand:raised',
} as const;

/** Union of the known Socket event names, derived from {@link SocketEvent}. */
export type SocketEventName = (typeof SocketEvent)[keyof typeof SocketEvent];

/**
 * Broadcast to a room when a participant's raised-hand state changes.
 * Emitted under {@link SocketEvent.HandRaised}.
 */
export interface HandRaisedPayload {
  /** Socket/participant id whose hand state changed. */
  participantId: string;
  /** Display name, so clients can render a toast without a lookup. */
  displayName: string;
  /** `true` when the hand was raised, `false` when lowered. */
  raised: boolean;
  /** Epoch milliseconds at which the change occurred. */
  at: number;
}

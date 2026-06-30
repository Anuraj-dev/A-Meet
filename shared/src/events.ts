// Socket.io contracts shared by the client and server. Keeping the event names
// and payload shapes in one place stops the two ends from drifting as features
// land — the compiler flags a mismatch the moment one side changes.

import type { WebRtcServerToClientEvents } from './webrtc';

/**
 * Canonical Socket.io event names. Both ends import these constants instead of
 * hand-typing the string, so a rename is a single edit the compiler enforces.
 */
export const SocketEvent = {
  /** A participant raised or lowered their hand (M5 raise-hand feature). */
  HandRaised: 'hand:raised',
  /** SFU broadcast when a peer toggles their raised-hand state. */
  SfuHandRaiseUpdate: 'sfu-hand-raise-update',
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

/** Broadcast to room peers when an SFU participant toggles raise-hand. */
export interface SfuHandRaiseUpdatePayload {
  /** Socket id whose hand state changed. */
  socketId: string;
  /** `true` when the hand was raised, `false` when lowered. */
  raised: boolean;
}

export interface ServerToClientEvents extends WebRtcServerToClientEvents {
  [SocketEvent.HandRaised]: (payload: HandRaisedPayload) => void;
  [SocketEvent.SfuHandRaiseUpdate]: (payload: SfuHandRaiseUpdatePayload) => void;
  'sfu-new-producer': (payload: import('./sfu').SfuProducerDescriptor) => void;
  'sfu-consumer-closed': (payload: import('./sfu').SfuConsumerClosedPayload) => void;
  'sfu-peer-left': (payload: import('./sfu').SfuPeerLeftPayload) => void;
  'sfu-producer-paused': (payload: import('./sfu').SfuProducerStatePayload) => void;
  'sfu-producer-resumed': (payload: import('./sfu').SfuProducerStatePayload) => void;
  'sfu-active-speaker': (payload: import('./sfu').SfuActiveSpeakerPayload) => void;
}

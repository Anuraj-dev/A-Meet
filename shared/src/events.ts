// Socket.io contracts shared by the client and server. Keeping the event names
// and payload shapes in one place stops the two ends from drifting as features
// land — the compiler flags a mismatch the moment one side changes.

import type { WebRtcServerToClientEvents } from './webrtc';
import type { AuthUserDto } from './dto';
import type { SocketAck } from './sfu';

export interface RoomUser extends AuthUserDto { socketId?: string }
export interface ChatMessagePayload {
  sender: AuthUserDto;
  text: string;
  ts: number;
}
export interface TranscriptState {
  active: boolean;
  startedAt: number | null;
  startedBy: { id: string; name: string } | null;
  stoppedAt: number | null;
}
export interface TranscriptEntry {
  id: string;
  sequence: number;
  speaker: { id: string; name: string; avatar: string };
  text: string;
  ts: number;
  provider: string;
  provisional: boolean;
  revisedAt?: number;
}
export interface TranscriptInterim {
  utteranceId: string;
  speaker: { id: string; name: string; avatar: string };
  text: string;
  ts: number;
}
export interface TranscriptSnapshot extends TranscriptState {
  entries: TranscriptEntry[];
  configured: boolean;
}
export interface TranscriptContributorState {
  status: 'connecting' | 'listening' | 'error';
  provider?: string;
  message?: string;
}
type TranscriptControlAck = SocketAck<{ ok: true; state?: TranscriptState }>;

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
  'sfu-reaction': (payload: { emoji: string; socketId: string }) => void;
  'sfu-spotlight': (payload: { socketId: string | null }) => void;
  'room-users': (users: RoomUser[]) => void;
  'user-joined': (user: RoomUser) => void;
  'user-left': (user: RoomUser) => void;
  'chat-message': (message: ChatMessagePayload) => void;
  'transcript-snapshot': (snapshot: TranscriptSnapshot) => void;
  'transcript-state': (state: TranscriptState) => void;
  'transcript-segment': (entry: TranscriptEntry) => void;
  'transcript-interim': (interim: TranscriptInterim) => void;
  'transcript-contributor-state': (state: TranscriptContributorState) => void;
  'sfu-meeting-ended': () => void;
  'sfu-force-muted': () => void;
  'sfu-unmute-request': (payload: { by: string }) => void;
  'sfu-removed': () => void;
}

export interface RoomClientToServerEvents {
  'join-room': (roomId: string) => void;
  'leave-room': (roomId?: string) => void;
  'chat-message': (payload: { roomId: string; text: string }) => void;
  'transcript-start': (payload: Record<string, never>, callback: (response: TranscriptControlAck) => void) => void;
  'transcript-stop': (payload: Record<string, never>, callback: (response: TranscriptControlAck) => void) => void;
  'transcript-contributor-start': (payload: Record<string, never>, callback: (response: SocketAck<{ ok: true }>) => void) => void;
  'transcript-audio': (audio: ArrayBuffer) => void;
  'transcript-contributor-stop': () => void;
}

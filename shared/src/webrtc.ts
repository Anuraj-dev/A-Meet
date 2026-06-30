export interface SessionDescriptionDto {
  type: 'answer' | 'offer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface IceCandidateDto {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface WebRtcPeerUser {
  name?: string;
  avatar?: string;
}

export interface WebRtcMediaStatePayload {
  to?: string;
  socketId?: string;
  user?: WebRtcPeerUser;
  video: boolean;
  audio: boolean;
}

export interface WebRtcRelayPayload<T> {
  to: string;
  description: T;
}

export interface WebRtcInboundRelayPayload<T> {
  from: string;
  description: T;
}

export interface WebRtcCandidateRelayPayload {
  to: string;
  candidate: IceCandidateDto;
}

export interface WebRtcInboundCandidatePayload {
  from: string;
  candidate: IceCandidateDto;
}

export interface WebRtcClientToServerEvents {
  'webrtc-ready': (roomId: string) => void;
  'webrtc-offer': (payload: WebRtcRelayPayload<SessionDescriptionDto>) => void;
  'webrtc-answer': (payload: WebRtcRelayPayload<SessionDescriptionDto>) => void;
  'webrtc-ice-candidate': (payload: WebRtcCandidateRelayPayload) => void;
  'webrtc-media-state': (payload: WebRtcMediaStatePayload) => void;
}

export interface WebRtcServerToClientEvents {
  'webrtc-peers': (peerIds: string[]) => void;
  'webrtc-offer': (payload: WebRtcInboundRelayPayload<SessionDescriptionDto>) => void;
  'webrtc-answer': (payload: WebRtcInboundRelayPayload<SessionDescriptionDto>) => void;
  'webrtc-ice-candidate': (payload: WebRtcInboundCandidatePayload) => void;
  'webrtc-media-state': (
    payload: Required<Pick<WebRtcMediaStatePayload, 'socketId' | 'video' | 'audio'>>
      & Pick<WebRtcMediaStatePayload, 'user'>,
  ) => void;
  'webrtc-peer-left': (payload: { socketId: string }) => void;
}

import type {
  AppData,
  DtlsParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
  TransportOptions,
} from 'mediasoup-client/types';

export interface SocketAckError {
  error: string;
}

export type SocketAck<T> = T | SocketAckError;

export interface SfuPeerUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface SfuProducerDescriptor {
  producerId: string;
  socketId: string;
  user: SfuPeerUser;
  kind: MediaKind;
  paused: boolean;
  appData: AppData;
}

export interface SfuConsumeResponse {
  id: string;
  producerId: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
  producerPaused: boolean;
}

export interface SfuRequestMap {
  'sfu-get-rtp-capabilities': {
    payload: { roomId: string };
    response: { rtpCapabilities: RtpCapabilities };
  };
  'sfu-create-transport': {
    payload: { direction: 'send' | 'recv' };
    response: TransportOptions;
  };
  'sfu-connect-transport': {
    payload: { transportId: string; dtlsParameters: DtlsParameters };
    response: { connected: true };
  };
  'sfu-produce': {
    payload: {
      transportId: string;
      kind: MediaKind;
      rtpParameters: RtpParameters;
      appData: AppData;
    };
    response: { id: string };
  };
  'sfu-consume': {
    payload: {
      transportId: string;
      producerId: string;
      rtpCapabilities: RtpCapabilities;
    };
    response: SfuConsumeResponse;
  };
  'sfu-resume-consumer': {
    payload: { consumerId: string };
    response: { resumed: true };
  };
  'sfu-get-producers': {
    payload: Record<string, never>;
    response: SfuProducerDescriptor[];
  };
  'sfu-pause-producer': {
    payload: { producerId: string };
    response: { paused: true };
  };
  'sfu-resume-producer': {
    payload: { producerId: string };
    response: { resumed: true };
  };
  'sfu-close-producer': {
    payload: { producerId: string };
    response: { closed: true };
  };
}

export type SfuRequestEvent = keyof SfuRequestMap;
export type SfuRequestPayload<E extends SfuRequestEvent> = SfuRequestMap[E]['payload'];
export type SfuRequestResponse<E extends SfuRequestEvent> = SfuRequestMap[E]['response'];

type SfuAckCallback<E extends SfuRequestEvent> = (
  response: SocketAck<SfuRequestResponse<E>>,
) => void;

export type ClientToServerEvents = {
  [E in SfuRequestEvent]: (
    payload: SfuRequestPayload<E>,
    callback: SfuAckCallback<E>,
  ) => void;
};

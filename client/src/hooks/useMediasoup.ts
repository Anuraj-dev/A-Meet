import { useCallback, useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import type { Consumer, MediaKind, Producer, Transport } from 'mediasoup-client/types';
import type {
  SfuActiveSpeakerPayload,
  SfuConsumerClosedPayload,
  SfuHandRaiseUpdatePayload,
  SfuPeerLeftPayload,
  SfuProducerDescriptor,
  SfuProducerStatePayload,
} from '@a-meet/contracts';
import socket from '../services/socket';
import { request } from '../services/mediasoup-signal';
import { ICE_SERVERS, ICE_TRANSPORT_POLICY } from '../services/ice-config';
import { appLogger } from '../utils/logger';
import {
  drainPendingProducers,
  dropPendingProducersForSocket,
  queuePendingProducer,
} from '../utils/pending-producers';

// Camera simulcast (3 spatial layers, each with L1T3 temporal layers). Single-
// encoding video can't degrade per-receiver: when a viewer's downlink drops the
// SFU keeps forwarding the full stream, congesting the shared transport and
// breaking the (tiny) audio riding alongside it. With layers, the SFU drops a
// temporal layer on the next frame — no keyframe wait — to free the pipe fast
// enough to keep voice intact. Bitrates suit a talking-head meeting tile.
const CAM_VIDEO_ENCODINGS = [
  { scaleResolutionDownBy: 4, maxBitrate: 200_000, scalabilityMode: 'L1T3' },
  { scaleResolutionDownBy: 2, maxBitrate: 500_000, scalabilityMode: 'L1T3' },
  { scaleResolutionDownBy: 1, maxBitrate: 1_500_000, scalabilityMode: 'L1T3' },
];
const CAM_VIDEO_CODEC_OPTIONS = { videoGoogleStartBitrate: 1000 };

interface MediaDevicesOptions {
  videoDeviceId?: string;
  audioDeviceId?: string;
  startVideoOn?: boolean;
  startAudioOn?: boolean;
}

interface PeerState {
  video: boolean;
  audio: boolean;
  name?: string;
  avatar?: string;
  handRaised?: boolean;
}

type ProducerSource = 'camera' | 'screen';
type LoggerLevel = keyof typeof appLogger;

interface ProducerInfo {
  socketId: string;
  kind: MediaKind;
  source: ProducerSource;
}

interface ConsumerEntry extends ProducerInfo {
  consumer: Consumer;
  producerId: string;
}

interface RtcConsumerStat {
  id: string;
  kind: MediaKind;
  source: ProducerSource;
  kbps: number;
  packetsLost: number;
  jitter: number | null;
  fec: number | null;
}

interface RtcStatsState {
  transport: string;
  consumers: RtcConsumerStat[];
}

interface InboundRtpStats extends RTCStats {
  bytesReceived: number;
  packetsLost?: number;
  jitter?: number;
  fecPacketsReceived?: number;
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const errorName = (error: unknown): string => error instanceof Error ? error.name : String(error);

export function useMediasoup(roomId: string, devices: MediaDevicesOptions = {}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({});
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});
  const [peerConnectionStates, setPeerConnectionStates] = useState<Record<string, string | undefined>>({});
  const [localVideoOn, setLocalVideoOn] = useState(false);
  const [localAudioOn, setLocalAudioOn] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [localScreenSurface, setLocalScreenSurface] = useState<string | null>(null);
  const [micGain, setMicGainState] = useState(1);
  const [handRaised, setHandRaised] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [rtcStats, setRtcStats] = useState<RtcStatsState | null>(null); // dev-only diagnostics

  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const producersRef = useRef(new Map<MediaKind, Producer>());
  const consumersRef = useRef(new Map<string, ConsumerEntry>());
  const peerStreamsRef = useRef(new Map<string, MediaStream>());
  const screenStreamsRef = useRef(new Map<string, MediaStream>());
  const producerInfoRef = useRef(new Map<string, ProducerInfo>());
  const pendingProducersRef = useRef(new Map<string, SfuProducerDescriptor>());
  const screenProducerRef = useRef<Producer | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const handRaisedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const gainSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micGainRef = useRef(1);        // desired mic gain (persists across reconnects)
  const devicesRef = useRef(devices);
  // These are the user's requested states, independent of whether mediasoup
  // has finished creating producers yet. On first join the local camera/mic is
  // available a little before the SFU negotiation completes; without these
  // refs, a click in that window was silently ignored.
  const desiredAudioOnRef = useRef(devices.startAudioOn ?? true);
  const desiredVideoOnRef = useRef(devices.startVideoOn ?? true);
  const initializedRef = useRef(false);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const logSfuStage = useCallback((stage: string, data: Record<string, unknown> = {}, level: LoggerLevel = 'info') => {
    const fn = appLogger[level] ?? appLogger.info;
    fn('sfu-stage', { roomId, stage, ...data });
  }, [roomId]);

  const toggleAudio = useCallback(async () => {
    const next = !desiredAudioOnRef.current;
    desiredAudioOnRef.current = next;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    // Update the local UI immediately. If negotiation is still in flight,
    // setupSfu reads the ref and creates the producer in this requested state.
    setLocalAudioOn(next && Boolean(localStreamRef.current?.getAudioTracks().length));
    const producer = producersRef.current.get('audio');
    if (!producer) return;
    try {
      if (next) {
        producer.resume();
        await request('sfu-resume-producer', { producerId: producer.id });
      } else {
        producer.pause();
        await request('sfu-pause-producer', { producerId: producer.id });
      }
    } catch (err: unknown) {
      if (import.meta.env.DEV) console.warn('[sfu] toggle audio failed:', errorMessage(err));
    }
  }, []);

  const toggleVideo = useCallback(async () => {
    const next = !desiredVideoOnRef.current;
    desiredVideoOnRef.current = next;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setLocalVideoOn(next && Boolean(localStreamRef.current?.getVideoTracks().length));
    const producer = producersRef.current.get('video');
    if (producer) {
      try {
        if (next) {
          producer.resume();
          await request('sfu-resume-producer', { producerId: producer.id });
        } else {
          producer.pause();
          await request('sfu-pause-producer', { producerId: producer.id });
        }
      } catch (err: unknown) {
        if (import.meta.env.DEV) console.warn('[sfu] toggle video failed:', errorMessage(err));
      }
      return;
    }

    // The common first-join path already has a camera track. If there is no
    // track (permission was granted later / no camera at entry), wait until the
    // send transport exists rather than pretending the camera is on.
    if (!next) return;
    const sendTransport = sendTransportRef.current;
    if (!sendTransport || !deviceRef.current?.canProduce('video')) return;
    const { videoDeviceId } = devicesRef.current;
    const constraint = videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraint });
      const track = stream.getVideoTracks()[0];
      if (!track || !localStreamRef.current) return;
      localStreamRef.current.addTrack(track);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      const newProducer = await sendTransport.produce({
        track,
        encodings: CAM_VIDEO_ENCODINGS,
        codecOptions: CAM_VIDEO_CODEC_OPTIONS,
        appData: { source: 'camera', mediaTag: 'video' },
      });
      producersRef.current.set('video', newProducer);
      newProducer.on('transportclose', () => producersRef.current.delete('video'));
      setLocalVideoOn(desiredVideoOnRef.current);
      setHasCamera(true);
    } catch (err: unknown) {
      if (import.meta.env.DEV) console.warn('[sfu] camera still unavailable:', errorName(err));
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    const producer = screenProducerRef.current;
    if (!producer) return;
    const producerId = producer.id;
    try { producer.close(); } catch { /* gone */ }
    screenProducerRef.current = null;
    request('sfu-close-producer', { producerId }).catch(() => {});
    const stream = localScreenStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    localScreenStreamRef.current = null;
    setLocalScreenStream(null);
    setLocalScreenSurface(null);
    setIsScreenSharing(false);
  }, []);

  const shareScreen = useCallback(async () => {
    if (screenProducerRef.current) return;
    const sendTransport = sendTransportRef.current;
    if (!sendTransport) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) { stream.getTracks().forEach((t) => t.stop()); return; }
      const producer = await sendTransport.produce({ track, appData: { source: 'screen' } });
      screenProducerRef.current = producer;
      localScreenStreamRef.current = stream;
      setLocalScreenStream(stream);
      setLocalScreenSurface(track.getSettings().displaySurface ?? null);
      setIsScreenSharing(true);
      track.addEventListener('ended', stopScreenShare, { once: true });
      producer.on('transportclose', stopScreenShare);
    } catch (err: unknown) {
      if (errorName(err) !== 'NotAllowedError' && import.meta.env.DEV) {
        console.warn('[sfu] screen share failed:', errorMessage(err));
      }
    }
  }, [stopScreenShare]);

  // Mic input volume — same architecture as Google Meet / Discord:
  // the GainNode is always in the signal chain (built in setupSfu before produce()).
  // Gain=1.0 is a transparent passthrough, so there is no quality penalty at 100%.
  // Slider drags only update gain.value — no replaceTrack, no async, no race.
  const setMicGain = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(2, value));
    micGainRef.current = clamped;
    setMicGainState(clamped);
    const ctxState = audioCtxRef.current?.state ?? 'none';
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = clamped;
      appLogger.debug('mic gain applied', { gain: clamped, ctxState });
    } else {
      appLogger.warn('mic gain set but gainNode not ready — value deferred', { gain: clamped, ctxState });
    }
    // Resume AudioContext if the browser suspended it (e.g. tab was backgrounded).
    if (audioCtxRef.current?.state === 'suspended') {
      appLogger.info('audioCtx suspended — triggering resume', { gain: clamped });
      audioCtxRef.current.resume().catch(() => {});
    }
  }, []);

  const toggleHand = useCallback(() => {
    const raised = !handRaisedRef.current;
    handRaisedRef.current = raised;
    setHandRaised(raised);
    socket.emit('sfu-raise-hand', { raised });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const consumers = consumersRef.current;
    const peerStreams = peerStreamsRef.current;
    const screenStreams = screenStreamsRef.current;
    const producerInfo = producerInfoRef.current;
    const pendingProducers = pendingProducersRef.current;
    const producers = producersRef.current;

    function dropPeer(socketId: string) {
      setRemoteStreams((prev) => {
        if (!(socketId in prev)) return prev;
        const next = { ...prev }; delete next[socketId]; return next;
      });
      setRemoteScreens((prev) => {
        if (!(socketId in prev)) return prev;
        const next = { ...prev }; delete next[socketId]; return next;
      });
      setPeerStates((prev) => {
        if (!(socketId in prev)) return prev;
        const next = { ...prev }; delete next[socketId]; return next;
      });
      setPeerConnectionStates((prev) => {
        if (!(socketId in prev)) return prev;
        const next = { ...prev }; delete next[socketId]; return next;
      });
    }

    async function consumeProducer({
      producerId,
      socketId,
      user,
      kind,
      paused,
      appData,
    }: SfuProducerDescriptor) {
      const source = appData?.source === 'screen' ? 'screen' : 'camera';
      const recvTransport = recvTransportRef.current;
      const device = deviceRef.current;
      if (!recvTransport || !device) {
        queuePendingProducer(pendingProducers, { producerId, socketId, user, kind, paused, appData });
        logSfuStage('consume-skipped', {
          producerId,
          socketId,
          kind,
          source,
          hasRecvTransport: Boolean(recvTransport),
          hasDevice: Boolean(device),
          queued: true,
        }, 'warn');
        return;
      }
      if (producerInfo.has(producerId)) return;
      producerInfo.set(producerId, { socketId, kind, source });

      try {
        logSfuStage('consume-requested', { producerId, socketId, kind, source });
        const params = await request('sfu-consume', {
          transportId: recvTransport.id,
          producerId,
          rtpCapabilities: device.rtpCapabilities,
        });
        if (cancelled) return;

        logSfuStage('consume-params-received', {
          producerId,
          socketId,
          consumerId: params.id,
          kind: params.kind,
          source,
        });
        const consumer = await recvTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });
        consumers.set(consumer.id, { consumer, socketId, producerId, kind: params.kind, source });

        // We keep a single mutable MediaStream per peer as the accumulator
        // (so we can add/remove tracks over the call), but publish a FRESH
        // `new MediaStream(...)` snapshot into state on every change. A new
        // reference forces the bound media elements to re-assign srcObject —
        // without it, a track added to a stream that's already attached to a
        // playing element (e.g. audio arriving after video) often isn't
        // rendered by Chrome. That race is the root of "sometimes can't hear".
        if (source === 'screen') {
          let stream = screenStreams.get(socketId);
          if (!stream) { stream = new MediaStream(); screenStreams.set(socketId, stream); }
          stream.addTrack(consumer.track);
          setRemoteScreens((prev) => ({ ...prev, [socketId]: new MediaStream(stream.getTracks()) }));
        } else {
          let stream = peerStreams.get(socketId);
          if (!stream) { stream = new MediaStream(); peerStreams.set(socketId, stream); }
          stream.addTrack(consumer.track);
          setRemoteStreams((prev) => ({ ...prev, [socketId]: new MediaStream(stream.getTracks()) }));
        }

        await request('sfu-resume-consumer', { consumerId: consumer.id });
        logSfuStage('consumer-resumed', { producerId, socketId, consumerId: consumer.id, kind: params.kind, source });

        if (source !== 'screen') {
          const off = paused || params.producerPaused;
          setPeerStates((prev) => {
            const cur = prev[socketId] ?? { video: false, audio: false };
            const next = { ...cur, name: user?.name ?? cur.name, avatar: user?.avatar ?? cur.avatar };
            if (params.kind === 'video') next.video = !off;
            if (params.kind === 'audio') next.audio = !off;
            return { ...prev, [socketId]: next };
          });
        } else {
          setPeerStates((prev) => {
            if (prev[socketId]?.name) return prev;
            const current = prev[socketId];
            const next = current
              ? { ...current, name: user?.name, avatar: user?.avatar }
              : { video: false, audio: false, name: user?.name, avatar: user?.avatar };
            return { ...prev, [socketId]: next };
          });
        }
        setPeerConnectionStates((prev) => ({ ...prev, [socketId]: recvTransportRef.current?.connectionState }));
      } catch (err: unknown) {
        producerInfo.delete(producerId);
        logSfuStage('consume-failed', {
          producerId,
          socketId,
          kind,
          source,
          err: errorMessage(err),
        }, 'error');
        if (import.meta.env.DEV) console.warn('[sfu] consume failed:', errorMessage(err));
      }
    }

    function closeConsumerById(consumerId: string) {
      const entry = consumers.get(consumerId);
      if (!entry) return;
      const { consumer, socketId, producerId, kind, source } = entry;
      const isScreen = source === 'screen';
      const stream = isScreen ? screenStreams.get(socketId) : peerStreams.get(socketId);
      try { stream?.removeTrack(consumer.track); } catch { /* gone */ }
      try { consumer.close(); } catch { /* gone */ }
      consumers.delete(consumerId);
      producerInfo.delete(producerId);

      if (isScreen) {
        if (stream && stream.getTracks().length === 0) {
          screenStreams.delete(socketId);
          setRemoteScreens((prev) => { const next = { ...prev }; delete next[socketId]; return next; });
        } else if (stream) {
          setRemoteScreens((prev) => ({ ...prev, [socketId]: new MediaStream(stream.getTracks()) }));
        }
      } else {
        if (stream && stream.getTracks().length === 0) {
          peerStreams.delete(socketId);
          dropPeer(socketId);
        } else if (stream) {
          setRemoteStreams((prev) => ({ ...prev, [socketId]: new MediaStream(stream.getTracks()) }));
          setPeerStates((prev) => {
            if (!prev[socketId]) return prev;
            const next = { ...prev[socketId] };
            if (kind === 'video') next.video = false;
            if (kind === 'audio') next.audio = false;
            return { ...prev, [socketId]: next };
          });
        }
      }
    }

    function removePeer(socketId: string) {
      for (const [cid, entry] of consumers) {
        if (entry.socketId !== socketId) continue;
        try { entry.consumer.close(); } catch { /* gone */ }
        consumers.delete(cid);
        producerInfo.delete(entry.producerId);
      }
      dropPendingProducersForSocket(pendingProducers, socketId);
      peerStreams.delete(socketId);
      screenStreams.delete(socketId);
      dropPeer(socketId);
    }

    const onNewProducer = (info: SfuProducerDescriptor) => consumeProducer(info);
    const onConsumerClosed = ({ consumerId }: SfuConsumerClosedPayload) => closeConsumerById(consumerId);
    const onPeerLeft = ({ socketId }: SfuPeerLeftPayload) => removePeer(socketId);
    const setPeerKind = (producerId: string, kindOn: boolean) => {
      const info = producerInfo.get(producerId);
      if (!info || info.source === 'screen') return;
      setPeerStates((prev) => {
        if (!prev[info.socketId]) return prev;
        const next = { ...prev[info.socketId] };
        if (info.kind === 'video') next.video = kindOn;
        if (info.kind === 'audio') next.audio = kindOn;
        return { ...prev, [info.socketId]: next };
      });
    };
    const onProducerPaused = ({ producerId }: SfuProducerStatePayload) => setPeerKind(producerId, false);
    const onProducerResumed = ({ producerId }: SfuProducerStatePayload) => setPeerKind(producerId, true);
    const onHandRaiseUpdate = ({ socketId, raised }: SfuHandRaiseUpdatePayload) => {
      setPeerStates((prev) => {
        if (!prev[socketId]) return prev;
        return { ...prev, [socketId]: { ...prev[socketId], handRaised: raised } };
      });
    };
    const onActiveSpeaker = ({ socketId }: SfuActiveSpeakerPayload) => setActiveSpeaker(socketId);

    // SFU signaling sequence — can be called on initial join and after reconnect.
    // Does NOT re-acquire media; expects `stream` to already be set in localStreamRef.
    async function setupSfu(stream: MediaStream) {
      if (cancelled) return;
      logSfuStage('setup-started', {
        hasAudioTrack: Boolean(stream?.getAudioTracks()[0]),
        hasVideoTrack: Boolean(stream?.getVideoTracks()[0]),
      });

      // Close any stale transports from a previous session before signaling.
      try { sendTransportRef.current?.close(); } catch { /* gone */ }
      try { recvTransportRef.current?.close(); } catch { /* gone */ }
      sendTransportRef.current = null;
      recvTransportRef.current = null;
      deviceRef.current = null;

      logSfuStage('rtp-capabilities-requested');
      const { rtpCapabilities } = await request('sfu-get-rtp-capabilities', { roomId });
      if (cancelled) return;
      logSfuStage('rtp-capabilities-received');

      const device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;
      logSfuStage('device-loaded');

      logSfuStage('send-transport-requested');
      const sendParams = await request('sfu-create-transport', { direction: 'send' });
      if (cancelled) return;
      // iceServers/iceTransportPolicy let the browser relay through coturn when
      // the direct path to the SFU is blocked (strict NAT / firewalls).
      const sendTransport = device.createSendTransport({
        ...sendParams,
        iceServers: ICE_SERVERS,
        iceTransportPolicy: ICE_TRANSPORT_POLICY,
      });
      logSfuStage('send-transport-created', { transportId: sendTransport.id });
      sendTransport.on('connect', ({ dtlsParameters }, cb, errb) => {
        logSfuStage('send-transport-connect-requested', { transportId: sendTransport.id });
        request('sfu-connect-transport', { transportId: sendTransport.id, dtlsParameters }).then(cb).catch(errb);
      });
      sendTransport.on('produce', ({ kind, rtpParameters, appData }, cb, errb) => {
        logSfuStage('produce-requested', { transportId: sendTransport.id, kind, source: appData?.source, mediaTag: appData?.mediaTag });
        request('sfu-produce', { transportId: sendTransport.id, kind, rtpParameters, appData })
          .then(({ id }) => cb({ id })).catch(errb);
      });
      sendTransport.on('connectionstatechange', (state) => {
        const level = state === 'failed' ? 'error' : state === 'connected' ? 'info' : 'debug';
        logSfuStage('send-transport-state', { transportId: sendTransport.id, state }, level);
      });
      sendTransportRef.current = sendTransport;

      logSfuStage('recv-transport-requested');
      const recvParams = await request('sfu-create-transport', { direction: 'recv' });
      if (cancelled) return;
      const recvTransport = device.createRecvTransport({
        ...recvParams,
        iceServers: ICE_SERVERS,
        iceTransportPolicy: ICE_TRANSPORT_POLICY,
      });
      logSfuStage('recv-transport-created', { transportId: recvTransport.id });
      recvTransport.on('connect', ({ dtlsParameters }, cb, errb) => {
        logSfuStage('recv-transport-connect-requested', { transportId: recvTransport.id });
        request('sfu-connect-transport', { transportId: recvTransport.id, dtlsParameters }).then(cb).catch(errb);
      });
      // One recv transport serves every remote peer, so its live ICE/DTLS state
      // is the receive health for all of them. consumeProducer stamps a peer's
      // initial state when first consumed — often "connecting" mid-handshake.
      // Without this listener that snapshot freezes, so the "Connecting…" badge
      // never clears once the transport reaches "connected". (A peer leaving
      // closes consumers, not this transport, so this won't false-flag tiles.)
      recvTransport.on('connectionstatechange', (state) => {
        const level = state === 'failed' ? 'error' : state === 'connected' ? 'info' : 'debug';
        logSfuStage('recv-transport-state', { transportId: recvTransport.id, state }, level);
        setPeerConnectionStates((prev) => {
          const ids = Object.keys(prev);
          if (ids.length === 0) return prev;
          const next: Record<string, string> = {};
          for (const sid of ids) next[sid] = state;
          return next;
        });
      });
      recvTransportRef.current = recvTransport;

      const audioTrack = stream?.getAudioTracks()[0];
      if (audioTrack && device.canProduce('audio')) {
        logSfuStage('audio-producer-started');
        // Build the gain graph before producing. The GainNode is always in the
        // signal path (gain=1.0 at startup = transparent passthrough). Matching
        // sampleRate to the captured track prevents resampling on PipeWire.
        // The user clicked Join to get here, so AudioContext.resume() succeeds.
        const trackSampleRate = audioTrack.getSettings().sampleRate || 48000;
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass) throw new Error('AudioContext is unavailable.');
          audioCtxRef.current = new AudioContextClass({
            sampleRate: trackSampleRate,
            latencyHint: 'interactive',
          });
          appLogger.info('audioCtx created', { sampleRate: trackSampleRate, state: audioCtxRef.current.state });
        }
        const ctx = audioCtxRef.current;
        if (!ctx) throw new Error('AudioContext initialization failed.');
        if (ctx.state !== 'running') {
          try {
            await ctx.resume();
            appLogger.info('audioCtx resumed', { state: ctx.state });
          } catch (e: unknown) {
            appLogger.warn('audioCtx resume failed', { err: errorMessage(e), state: ctx.state });
          }
        }
        const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
        const gain = ctx.createGain();
        const dest = ctx.createMediaStreamDestination();
        gain.gain.value = micGainRef.current;
        src.connect(gain);
        gain.connect(dest);
        gainSrcRef.current = src;
        gainNodeRef.current = gain;
        gainDestRef.current = dest;
        appLogger.info('gain graph built', { initialGain: micGainRef.current, ctxState: ctx.state, sampleRate: ctx.sampleRate });

        const p = await sendTransport.produce({
          track: dest.stream.getAudioTracks()[0],
          codecOptions: {
            opusStereo: false,
            opusFec: true,
            opusDtx: true,
            opusNack: true,
            opusPtime: 20,
          },
          appData: { source: 'camera', mediaTag: 'audio' },
        });
        producers.set('audio', p);
        p.on('transportclose', () => producers.delete('audio'));
        if (!desiredAudioOnRef.current) { p.pause(); await request('sfu-pause-producer', { producerId: p.id }); }
        setLocalAudioOn(desiredAudioOnRef.current);
        appLogger.info('audio producer created', { producerId: p.id, audioOn: desiredAudioOnRef.current });
        logSfuStage('audio-producer-created', { producerId: p.id, audioOn: desiredAudioOnRef.current });
      }
      const videoTrack = stream?.getVideoTracks()[0];
      if (videoTrack && device.canProduce('video')) {
        logSfuStage('video-producer-started');
        const p = await sendTransport.produce({
          track: videoTrack,
          encodings: CAM_VIDEO_ENCODINGS,
          codecOptions: CAM_VIDEO_CODEC_OPTIONS,
          appData: { source: 'camera', mediaTag: 'video' },
        });
        producers.set('video', p);
        p.on('transportclose', () => producers.delete('video'));
        if (!desiredVideoOnRef.current) { p.pause(); await request('sfu-pause-producer', { producerId: p.id }); }
        setLocalVideoOn(desiredVideoOnRef.current);
        logSfuStage('video-producer-created', { producerId: p.id, videoOn: desiredVideoOnRef.current });
      }
      if (cancelled) return;

      logSfuStage('existing-producers-requested');
      const existing = await request('sfu-get-producers');
      if (cancelled) return;
      logSfuStage('existing-producers-received', { count: existing.length });
      for (const prod of existing) await consumeProducer(prod);

      const queued = drainPendingProducers(pendingProducers);
      if (queued.length > 0) {
        logSfuStage('pending-producers-drained', { count: queued.length });
        for (const prod of queued) await consumeProducer(prod);
      }

      // Re-assert raise-hand after a reconnect: the server creates a fresh peer
      // (handRaised=false) on rejoin, so without this the indicator others saw
      // would silently clear. handRaisedRef persists across reconnects.
      if (handRaisedRef.current) socket.emit('sfu-raise-hand', { raised: true });
    }

    async function init() {
      const { videoDeviceId, audioDeviceId } = devicesRef.current;
      const stream = new MediaStream();
      let deniedCount = 0;

      try {
        // Full WebRTC voice pipeline (Google Meet parity): echo cancellation +
        // noise suppression + auto gain. Disabling NS/AGC or pinning a fixed
        // sampleRate/channelCount on Linux (PipeWire/PulseAudio) forces resampling
        // and drops the noise gate — that's what produced the constant crackle
        // and feedback during silence. Let the browser negotiate the rate.
        const audioConstraints = {
          ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
        const s = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        s.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch (err: unknown) {
        if (errorName(err) === 'NotAllowedError' || errorName(err) === 'NotFoundError') deniedCount++;
      }
      try {
        const c = videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true;
        const s = await navigator.mediaDevices.getUserMedia({ video: c });
        s.getVideoTracks().forEach((t) => stream.addTrack(t));
      } catch (err: unknown) {
        if (errorName(err) === 'NotAllowedError' || errorName(err) === 'NotFoundError') deniedCount++;
      }

      if (deniedCount === 2) setPermissionDenied(true);
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

      const hasMicTrack = stream.getAudioTracks().length > 0;
      const hasCamTrack = stream.getVideoTracks().length > 0;
      appLogger.info('media acquired', { hasMic: hasMicTrack, hasCamera: hasCamTrack, permissionDenied: deniedCount === 2 });
      logSfuStage('media-acquired', {
        hasMic: hasMicTrack,
        hasCamera: hasCamTrack,
        permissionDenied: deniedCount === 2,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setHasMic(hasMicTrack);
      setHasCamera(hasCamTrack);
      // Show the actual requested device state as soon as capture completes,
      // not only after the async SFU producer handshake. This keeps controls
      // truthful and makes immediate first-join clicks deterministic.
      setLocalAudioOn(hasMicTrack && desiredAudioOnRef.current);
      setLocalVideoOn(hasCamTrack && desiredVideoOnRef.current);

      socket.connect();

      socket.on('sfu-new-producer', onNewProducer);
      socket.on('sfu-consumer-closed', onConsumerClosed);
      socket.on('sfu-peer-left', onPeerLeft);
      socket.on('sfu-producer-paused', onProducerPaused);
      socket.on('sfu-producer-resumed', onProducerResumed);
      socket.on('sfu-hand-raise-update', onHandRaiseUpdate);
      socket.on('sfu-active-speaker', onActiveSpeaker);

      try {
        await setupSfu(stream);
        initializedRef.current = true;
        appLogger.info('SFU init complete');
        logSfuStage('setup-complete');
      } catch (err: unknown) {
        appLogger.error('SFU init failed', { err: errorMessage(err) });
        logSfuStage('setup-failed', { err: errorMessage(err) }, 'error');
        if (!cancelled && import.meta.env.DEV) console.error('[sfu] init failed:', errorMessage(err));
      }
    }

    const onSocketConnect = async () => {
      setSocketConnected(true);
      if (!initializedRef.current || !localStreamRef.current || cancelled) return;

      // Stale remote state — clear it so reconnect starts fresh.
      consumers.clear();
      peerStreams.clear();
      screenStreams.clear();
      producerInfo.clear();
      pendingProducers.clear();
      producers.clear();
      setRemoteStreams({});
      setRemoteScreens({});
      setPeerStates({});
      setPeerConnectionStates({});

      // The gain graph feeds the old producer which is now dead. Tear it down;
      // setupSfu will rebuild it against the fresh producer using micGainRef.current.
      appLogger.info('socket reconnect — tearing down gain graph', { savedGain: micGainRef.current });
      try { gainSrcRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainNodeRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainDestRef.current?.disconnect(); } catch { /* ignore */ }
      gainSrcRef.current = null; gainNodeRef.current = null; gainDestRef.current = null;

      try {
        await setupSfu(localStreamRef.current);
        logSfuStage('reconnect-complete');
      } catch (err: unknown) {
        appLogger.error('SFU reconnect failed', { err: errorMessage(err) });
        logSfuStage('reconnect-failed', { err: errorMessage(err) }, 'error');
        if (!cancelled && import.meta.env.DEV) console.error('[sfu] reconnect failed:', errorMessage(err));
      }
    };

    const onSocketDisconnect = () => setSocketConnected(false);

    socket.on('connect', onSocketConnect);
    socket.on('disconnect', onSocketDisconnect);

    init();

    return () => {
      cancelled = true;
      initializedRef.current = false;

      socket.off('sfu-new-producer', onNewProducer);
      socket.off('sfu-consumer-closed', onConsumerClosed);
      socket.off('sfu-peer-left', onPeerLeft);
      socket.off('sfu-producer-paused', onProducerPaused);
      socket.off('sfu-producer-resumed', onProducerResumed);
      socket.off('sfu-hand-raise-update', onHandRaiseUpdate);
      socket.off('sfu-active-speaker', onActiveSpeaker);
      socket.off('connect', onSocketConnect);
      socket.off('disconnect', onSocketDisconnect);

      try { sendTransportRef.current?.close(); } catch { /* gone */ }
      try { recvTransportRef.current?.close(); } catch { /* gone */ }
      sendTransportRef.current = null;
      recvTransportRef.current = null;
      deviceRef.current = null;
      producers.clear();
      consumers.clear();
      peerStreams.clear();
      screenStreams.clear();
      producerInfo.clear();
      pendingProducers.clear();

      try { screenProducerRef.current?.close(); } catch { /* gone */ }
      screenProducerRef.current = null;
      localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;

      try { gainSrcRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainNodeRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainDestRef.current?.disconnect(); } catch { /* ignore */ }
      gainSrcRef.current = null; gainNodeRef.current = null; gainDestRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;

      setRemoteStreams({});
      setRemoteScreens({});
      setPeerStates({});
      setPeerConnectionStates({});
      setLocalStream(null);
      setIsScreenSharing(false);
      setLocalScreenStream(null);
    };
  }, [roomId, logSfuStage]);

  // Dev-only WebRTC diagnostics: poll each consumer's inbound-rtp stats so the
  // overlay can show packet loss, jitter, bitrate and FEC — the concrete signal
  // for "is audio actually flowing cleanly?" Tree-shaken out of prod builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const prev = new Map<string, { bytes: number; ts: number }>(); // consumerId → { bytes, ts }
    const id = setInterval(async () => {
      const consumers = consumersRef.current;
      const out: RtcConsumerStat[] = [];
      for (const [cid, entry] of consumers) {
        try {
          const report = await entry.consumer.getStats();
          report.forEach((stat: RTCStats) => {
            if (stat.type !== 'inbound-rtp') return;
            const s = stat as InboundRtpStats;
            const last = prev.get(cid);
            let kbps = 0;
            if (last && s.timestamp > last.ts) {
              kbps = Math.round(((s.bytesReceived - last.bytes) * 8) / (s.timestamp - last.ts));
            }
            prev.set(cid, { bytes: s.bytesReceived, ts: s.timestamp });
            out.push({
              id: cid,
              kind: entry.kind,
              source: entry.source,
              kbps,
              packetsLost: s.packetsLost ?? 0,
              jitter: s.jitter != null ? Math.round(s.jitter * 1000) : null,
              fec: s.fecPacketsReceived ?? null,
            });
          });
        } catch { /* consumer gone mid-poll */ }
      }
      setRtcStats({ transport: recvTransportRef.current?.connectionState ?? 'n/a', consumers: out });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return {
    localStream,
    remoteStreams,
    remoteScreens,
    peerStates,
    peerConnectionStates,
    localVideoOn,
    localAudioOn,
    hasCamera,
    hasMic,
    toggleVideo,
    toggleAudio,
    isScreenSharing,
    localScreenStream,
    localScreenSurface,
    shareScreen,
    stopScreenShare,
    micGain,
    setMicGain,
    handRaised,
    toggleHand,
    activeSpeaker,
    socketConnected,
    permissionDenied,
    rtcStats,
  };
}

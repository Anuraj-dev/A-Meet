import { useCallback, useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import socket from '../services/socket';
import { request } from '../services/mediasoup-signal';
import { ICE_SERVERS, ICE_TRANSPORT_POLICY } from '../services/ice-config';

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

export function useMediasoup(roomId, devices = {}) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteScreens, setRemoteScreens] = useState({});
  const [peerStates, setPeerStates] = useState({});
  const [peerConnectionStates, setPeerConnectionStates] = useState({});
  const [localVideoOn, setLocalVideoOn] = useState(false);
  const [localAudioOn, setLocalAudioOn] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [localScreenSurface, setLocalScreenSurface] = useState(null);
  const [micGain, setMicGainState] = useState(1);
  const [handRaised, setHandRaised] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [rtcStats, setRtcStats] = useState(null); // dev-only diagnostics

  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const localStreamRef = useRef(null);
  const producersRef = useRef(new Map());
  const consumersRef = useRef(new Map());
  const peerStreamsRef = useRef(new Map());
  const screenStreamsRef = useRef(new Map());
  const producerInfoRef = useRef(new Map());
  const screenProducerRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const handRaisedRef = useRef(false);
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const gainSrcRef = useRef(null);
  const gainDestRef = useRef(null);
  const gainEngagedRef = useRef(false);
  const micGainRef = useRef(1);        // desired mic gain (persists across reconnects)
  const setMicGainRef = useRef(null);  // stable handle so the socket effect can re-apply
  const devicesRef = useRef(devices);
  const initializedRef = useRef(false);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const toggleAudio = useCallback(async () => {
    const producer = producersRef.current.get('audio');
    if (!producer) return;
    try {
      if (producer.paused) {
        producer.resume();
        await request('sfu-resume-producer', { producerId: producer.id });
        setLocalAudioOn(true);
      } else {
        producer.pause();
        await request('sfu-pause-producer', { producerId: producer.id });
        setLocalAudioOn(false);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[sfu] toggle audio failed:', err.message);
    }
  }, []);

  const toggleVideo = useCallback(async () => {
    const producer = producersRef.current.get('video');
    if (producer) {
      try {
        if (producer.paused) {
          producer.resume();
          await request('sfu-resume-producer', { producerId: producer.id });
          setLocalVideoOn(true);
        } else {
          producer.pause();
          await request('sfu-pause-producer', { producerId: producer.id });
          setLocalVideoOn(false);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[sfu] toggle video failed:', err.message);
      }
      return;
    }

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
      setLocalVideoOn(true);
      setHasCamera(true);
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[sfu] camera still unavailable:', err.name);
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
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
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
    } catch (err) {
      if (err.name !== 'NotAllowedError' && import.meta.env.DEV) {
        console.warn('[sfu] screen share failed:', err.message);
      }
    }
  }, [stopScreenShare]);

  // Mic input volume. At unity (100%) the producer carries the *raw* mic track
  // untouched (keeps the live path clean — routing through Web Audio crackles on
  // PipeWire). Off unity, the track is routed mic → GainNode → MediaStreamDest
  // and swapped onto the producer via replaceTrack.
  //
  // The whole graph is built EXACTLY ONCE, synchronously. MUI's Slider fires
  // onChange on every pointer move, so a single drag calls this many times in
  // quick succession; the old code only set gainEngagedRef AFTER an `await`, so
  // concurrent calls each spun up their own graph, the refs kept only the last,
  // and the producer could end up wired to an orphaned (GC'd) destination node →
  // the mic went silent. Building synchronously before the first await closes
  // that race; later drag events just retune the existing gain node.
  const setMicGain = useCallback(async (value) => {
    const clamped = Math.max(0, Math.min(2, value));
    micGainRef.current = clamped;
    setMicGainState(clamped);

    const producer = producersRef.current.get('audio');
    const rawTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!producer || !rawTrack) return;

    const EPS = 0.02;

    // Back to unity — bypass the gain graph, restore the untouched raw track.
    if (Math.abs(clamped - 1) < EPS) {
      if (!gainEngagedRef.current) return;
      gainEngagedRef.current = false; // sync guard: blocks re-entry mid-await
      try { await producer.replaceTrack({ track: rawTrack }); } catch { /* ignore */ }
      try { gainSrcRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainNodeRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainDestRef.current?.disconnect(); } catch { /* ignore */ }
      gainSrcRef.current = null; gainNodeRef.current = null; gainDestRef.current = null;
      return;
    }

    // Already routed through the gain graph — just retune (cheap, synchronous).
    if (gainEngagedRef.current && gainNodeRef.current) {
      gainNodeRef.current.gain.value = clamped;
      return;
    }

    // First non-unity move: build the graph once. Everything that must exist
    // before we yield (nodes, refs, engaged flag) is created up front so a
    // racing drag event takes the retune path above instead of building again.
    gainEngagedRef.current = true;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    const src = ctx.createMediaStreamSource(new MediaStream([rawTrack]));
    const gain = ctx.createGain();
    const dest = ctx.createMediaStreamDestination();
    gain.gain.value = clamped;
    src.connect(gain);
    gain.connect(dest);
    gainSrcRef.current = src;
    gainNodeRef.current = gain;
    gainDestRef.current = dest;

    // A MediaStreamDestination outputs silence while its context is suspended,
    // so make sure it's running before the producer starts pulling from it.
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
    // Skip the swap if a unity reset slipped in during the await (it nulls dest).
    if (gainEngagedRef.current && gainDestRef.current === dest) {
      try { await producer.replaceTrack({ track: dest.stream.getAudioTracks()[0] }); } catch { /* ignore */ }
    }
  }, []);
  // Stable handle so the socket effect can re-apply mic gain after a reconnect
  // without taking setMicGain as a dependency.
  useEffect(() => { setMicGainRef.current = setMicGain; }, [setMicGain]);

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
    const producers = producersRef.current;

    function dropPeer(socketId) {
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

    async function consumeProducer({ producerId, socketId, user, kind, paused, appData }) {
      const source = appData?.source === 'screen' ? 'screen' : 'camera';
      const recvTransport = recvTransportRef.current;
      const device = deviceRef.current;
      if (!recvTransport || !device) return;
      if (producerInfo.has(producerId)) return;
      producerInfo.set(producerId, { socketId, kind, source });

      try {
        const params = await request('sfu-consume', {
          transportId: recvTransport.id,
          producerId,
          rtpCapabilities: device.rtpCapabilities,
        });
        if (cancelled) return;

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
            return { ...prev, [socketId]: { video: false, audio: false, ...prev[socketId], name: user?.name, avatar: user?.avatar } };
          });
        }
        setPeerConnectionStates((prev) => ({ ...prev, [socketId]: recvTransportRef.current?.connectionState }));
      } catch (err) {
        producerInfo.delete(producerId);
        if (import.meta.env.DEV) console.warn('[sfu] consume failed:', err.message);
      }
    }

    function closeConsumerById(consumerId) {
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

    function removePeer(socketId) {
      for (const [cid, entry] of consumers) {
        if (entry.socketId !== socketId) continue;
        try { entry.consumer.close(); } catch { /* gone */ }
        consumers.delete(cid);
        producerInfo.delete(entry.producerId);
      }
      peerStreams.delete(socketId);
      screenStreams.delete(socketId);
      dropPeer(socketId);
    }

    const onNewProducer = (info) => consumeProducer(info);
    const onConsumerClosed = ({ consumerId }) => closeConsumerById(consumerId);
    const onPeerLeft = ({ socketId }) => removePeer(socketId);
    const setPeerKind = (producerId, kindOn) => {
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
    const onProducerPaused = ({ producerId }) => setPeerKind(producerId, false);
    const onProducerResumed = ({ producerId }) => setPeerKind(producerId, true);
    const onHandRaiseUpdate = ({ socketId, raised }) => {
      setPeerStates((prev) => {
        if (!prev[socketId]) return prev;
        return { ...prev, [socketId]: { ...prev[socketId], handRaised: raised } };
      });
    };
    const onActiveSpeaker = ({ socketId }) => setActiveSpeaker(socketId);

    // SFU signaling sequence — can be called on initial join and after reconnect.
    // Does NOT re-acquire media; expects `stream` to already be set in localStreamRef.
    async function setupSfu(stream) {
      if (cancelled) return;

      // Close any stale transports from a previous session before signaling.
      try { sendTransportRef.current?.close(); } catch { /* gone */ }
      try { recvTransportRef.current?.close(); } catch { /* gone */ }
      sendTransportRef.current = null;
      recvTransportRef.current = null;
      deviceRef.current = null;

      const { startVideoOn = true, startAudioOn = true } = devicesRef.current;

      const { rtpCapabilities } = await request('sfu-get-rtp-capabilities', { roomId });
      if (cancelled) return;

      const device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;

      const sendParams = await request('sfu-create-transport', { direction: 'send' });
      if (cancelled) return;
      // iceServers/iceTransportPolicy let the browser relay through coturn when
      // the direct path to the SFU is blocked (strict NAT / firewalls).
      const sendTransport = device.createSendTransport({
        ...sendParams,
        iceServers: ICE_SERVERS,
        iceTransportPolicy: ICE_TRANSPORT_POLICY,
      });
      sendTransport.on('connect', ({ dtlsParameters }, cb, errb) => {
        request('sfu-connect-transport', { transportId: sendTransport.id, dtlsParameters }).then(cb).catch(errb);
      });
      sendTransport.on('produce', ({ kind, rtpParameters, appData }, cb, errb) => {
        request('sfu-produce', { transportId: sendTransport.id, kind, rtpParameters, appData })
          .then(({ id }) => cb({ id })).catch(errb);
      });
      sendTransportRef.current = sendTransport;

      const recvParams = await request('sfu-create-transport', { direction: 'recv' });
      if (cancelled) return;
      const recvTransport = device.createRecvTransport({
        ...recvParams,
        iceServers: ICE_SERVERS,
        iceTransportPolicy: ICE_TRANSPORT_POLICY,
      });
      recvTransport.on('connect', ({ dtlsParameters }, cb, errb) => {
        request('sfu-connect-transport', { transportId: recvTransport.id, dtlsParameters }).then(cb).catch(errb);
      });
      // One recv transport serves every remote peer, so its live ICE/DTLS state
      // is the receive health for all of them. consumeProducer stamps a peer's
      // initial state when first consumed — often "connecting" mid-handshake.
      // Without this listener that snapshot freezes, so the "Connecting…" badge
      // never clears once the transport reaches "connected". (A peer leaving
      // closes consumers, not this transport, so this won't false-flag tiles.)
      recvTransport.on('connectionstatechange', (state) => {
        setPeerConnectionStates((prev) => {
          const ids = Object.keys(prev);
          if (ids.length === 0) return prev;
          const next = {};
          for (const sid of ids) next[sid] = state;
          return next;
        });
      });
      recvTransportRef.current = recvTransport;

      const audioTrack = stream?.getAudioTracks()[0];
      if (audioTrack && device.canProduce('audio')) {
        const p = await sendTransport.produce({
          track: audioTrack,
          // Opus resilience for clear voice under packet loss (the "breaking"):
          //   opusFec  — in-band forward error correction recovers lost packets.
          //   opusNack — also allow retransmission of lost audio packets.
          //   opusDtx  — discontinuous transmission: stop sending during silence.
          //   opusStereo:false / opusPtime:20 — mono 20 ms voice frames (halves
          //     bitrate vs stereo, no quality loss for speech).
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
        if (!startAudioOn) { p.pause(); await request('sfu-pause-producer', { producerId: p.id }); }
        setLocalAudioOn(!!startAudioOn);
      }
      const videoTrack = stream?.getVideoTracks()[0];
      if (videoTrack && device.canProduce('video')) {
        const p = await sendTransport.produce({
          track: videoTrack,
          encodings: CAM_VIDEO_ENCODINGS,
          codecOptions: CAM_VIDEO_CODEC_OPTIONS,
          appData: { source: 'camera', mediaTag: 'video' },
        });
        producers.set('video', p);
        p.on('transportclose', () => producers.delete('video'));
        if (!startVideoOn) { p.pause(); await request('sfu-pause-producer', { producerId: p.id }); }
        setLocalVideoOn(!!startVideoOn);
      }
      if (cancelled) return;

      const existing = await request('sfu-get-producers');
      if (cancelled) return;
      for (const prod of existing) await consumeProducer(prod);
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
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') deniedCount++;
      }
      try {
        const c = videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true;
        const s = await navigator.mediaDevices.getUserMedia({ video: c });
        s.getVideoTracks().forEach((t) => stream.addTrack(t));
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') deniedCount++;
      }

      if (deniedCount === 2) setPermissionDenied(true);
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

      const hasMicTrack = stream.getAudioTracks().length > 0;
      const hasCamTrack = stream.getVideoTracks().length > 0;
      localStreamRef.current = stream;
      setLocalStream(stream);
      setHasMic(hasMicTrack);
      setHasCamera(hasCamTrack);

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
      } catch (err) {
        if (!cancelled && import.meta.env.DEV) console.error('[sfu] init failed:', err.message);
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
      producers.clear();
      setRemoteStreams({});
      setRemoteScreens({});
      setPeerStates({});
      setPeerConnectionStates({});

      // The audio producer is rebuilt from the raw mic track on reconnect, so any
      // gain graph from before now feeds a dead producer. Drop it and re-apply the
      // user's saved mic volume against the fresh producer.
      try { gainSrcRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainNodeRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainDestRef.current?.disconnect(); } catch { /* ignore */ }
      gainSrcRef.current = null; gainNodeRef.current = null; gainDestRef.current = null;
      gainEngagedRef.current = false;

      try {
        await setupSfu(localStreamRef.current);
        if (Math.abs(micGainRef.current - 1) >= 0.02) {
          setMicGainRef.current?.(micGainRef.current);
        }
      } catch (err) {
        if (!cancelled && import.meta.env.DEV) console.error('[sfu] reconnect failed:', err.message);
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

      try { screenProducerRef.current?.close(); } catch { /* gone */ }
      screenProducerRef.current = null;
      localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;

      // Tear down mic gain graph if engaged
      try { gainSrcRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainNodeRef.current?.disconnect(); } catch { /* ignore */ }
      try { gainDestRef.current?.disconnect(); } catch { /* ignore */ }
      gainSrcRef.current = null; gainNodeRef.current = null; gainDestRef.current = null;
      gainEngagedRef.current = false;
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
  }, [roomId]);

  // Dev-only WebRTC diagnostics: poll each consumer's inbound-rtp stats so the
  // overlay can show packet loss, jitter, bitrate and FEC — the concrete signal
  // for "is audio actually flowing cleanly?" Tree-shaken out of prod builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const prev = new Map(); // consumerId → { bytes, ts }
    const id = setInterval(async () => {
      const consumers = consumersRef.current;
      const out = [];
      for (const [cid, entry] of consumers) {
        try {
          const report = await entry.consumer.getStats();
          report.forEach((s) => {
            if (s.type !== 'inbound-rtp') return;
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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import socket from '../services/socket';
import { request } from '../services/mediasoup-signal';

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
  const [handRaised, setHandRaised] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

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
      const newProducer = await sendTransport.produce({ track, appData: { source: 'camera', mediaTag: 'video' } });
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
    try { producer.close(); } catch { /* gone */ }
    screenProducerRef.current = null;
    const stream = localScreenStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    localScreenStreamRef.current = null;
    setLocalScreenStream(null);
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
      setIsScreenSharing(true);
      track.addEventListener('ended', stopScreenShare, { once: true });
      producer.on('transportclose', stopScreenShare);
    } catch (err) {
      if (err.name !== 'NotAllowedError' && import.meta.env.DEV) {
        console.warn('[sfu] screen share failed:', err.message);
      }
    }
  }, [stopScreenShare]);

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

        if (source === 'screen') {
          let stream = screenStreams.get(socketId);
          if (!stream) { stream = new MediaStream(); screenStreams.set(socketId, stream); }
          stream.addTrack(consumer.track);
          setRemoteScreens((prev) => ({ ...prev, [socketId]: stream }));
        } else {
          let stream = peerStreams.get(socketId);
          if (!stream) { stream = new MediaStream(); peerStreams.set(socketId, stream); }
          stream.addTrack(consumer.track);
          setRemoteStreams((prev) => ({ ...prev, [socketId]: stream }));
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
          setRemoteScreens((prev) => ({ ...prev, [socketId]: stream }));
        }
      } else {
        if (stream && stream.getTracks().length === 0) {
          peerStreams.delete(socketId);
          dropPeer(socketId);
        } else if (stream) {
          setRemoteStreams((prev) => ({ ...prev, [socketId]: stream }));
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
      const sendTransport = device.createSendTransport(sendParams);
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
      const recvTransport = device.createRecvTransport(recvParams);
      recvTransport.on('connect', ({ dtlsParameters }, cb, errb) => {
        request('sfu-connect-transport', { transportId: recvTransport.id, dtlsParameters }).then(cb).catch(errb);
      });
      recvTransport.on('connectionstatechange', (state) => {
        setPeerConnectionStates((prev) => {
          const next = {};
          for (const id of Object.keys(prev)) next[id] = state;
          return next;
        });
      });
      recvTransportRef.current = recvTransport;

      const audioTrack = stream?.getAudioTracks()[0];
      if (audioTrack && device.canProduce('audio')) {
        const p = await sendTransport.produce({ track: audioTrack, appData: { source: 'camera', mediaTag: 'audio' } });
        producers.set('audio', p);
        p.on('transportclose', () => producers.delete('audio'));
        if (!startAudioOn) { p.pause(); await request('sfu-pause-producer', { producerId: p.id }); }
        setLocalAudioOn(!!startAudioOn);
      }
      const videoTrack = stream?.getVideoTracks()[0];
      if (videoTrack && device.canProduce('video')) {
        const p = await sendTransport.produce({ track: videoTrack, appData: { source: 'camera', mediaTag: 'video' } });
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
        const c = audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true;
        const s = await navigator.mediaDevices.getUserMedia({ audio: c });
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

      try {
        await setupSfu(localStreamRef.current);
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
    shareScreen,
    stopScreenShare,
    handRaised,
    toggleHand,
    activeSpeaker,
    socketConnected,
    permissionDenied,
  };
}

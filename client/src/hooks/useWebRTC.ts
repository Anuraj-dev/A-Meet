import { useCallback, useEffect, useRef, useState } from 'react';
import socket from '../services/socket';
import { createPeerConnection } from '../services/webrtc';
import type {
  WebRtcInboundCandidatePayload,
  WebRtcInboundRelayPayload,
  WebRtcMediaStatePayload,
  SessionDescriptionDto,
} from '@a-meet/contracts';

interface MediaDevicesOptions {
  videoDeviceId?: string;
  audioDeviceId?: string;
  startVideoOn?: boolean;
  startAudioOn?: boolean;
}

interface PeerMediaState {
  video: boolean;
  audio: boolean;
  name?: string;
  avatar?: string;
}

const errorName = (error: unknown): string => error instanceof Error ? error.name : String(error);

// Orchestrates a hand-built WebRTC mesh (1:1 for M2/M3, but per-peer so it
// generalises). Returns local media + controls plus a map of remote streams
// (keyed by socketId) and each peer's camera/mic on-off state.
//
// Media acquisition: audio and video are requested SEPARATELY so a busy camera
// only costs us video — the mic still works. Device IDs from the lobby are
// forwarded as exact constraints. Never bail out of signaling on media failure.
//
// Renegotiation (M3.3): each PC has an onnegotiationneeded handler that fires
// when addTrack is called (e.g., user turns camera on after joining without one).
// It only acts when signalingState is 'stable' to avoid offer glare.
export function useWebRTC(roomId: string, devices: MediaDevicesOptions = {}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({}); // socketId → MediaStream
  const [peerStates, setPeerStates] = useState<Record<string, PeerMediaState>>({}); // socketId → { video, audio, name, avatar }
  const [peerConnectionStates, setPeerConnectionStates] = useState<Record<string, RTCPeerConnectionState>>({}); // socketId → RTCPeerConnectionState
  const [localVideoOn, setLocalVideoOn] = useState(false);
  const [localAudioOn, setLocalAudioOn] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMic, setHasMic] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef(new Map<string, RTCPeerConnection>()); // socketId → RTCPeerConnection
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>()); // socketId → RTCIceCandidateInit[]
  const mediaStateRef = useRef({ video: false, audio: false });
  // Keep device IDs accessible inside async callbacks without stale closures.
  const devicesRef = useRef(devices);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const sendMediaState = useCallback((to?: string) => {
    socket.emit('webrtc-media-state', {
      to,
      video: mediaStateRef.current.video,
      audio: mediaStateRef.current.audio,
    });
  }, []);

  const toggleAudio = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = next; });
    mediaStateRef.current.audio = next;
    setLocalAudioOn(next);
    sendMediaState();
  }, [sendMediaState]);

  // toggleVideo handles two cases:
  //   1. A video track already exists → flip track.enabled (no renegotiation needed).
  //   2. No video track → acquire camera and addTrack to all PCs, which fires
  //      onnegotiationneeded per-PC and triggers a new offer automatically.
  const toggleVideo = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    if (tracks.length > 0) {
      const next = !tracks[0].enabled;
      tracks.forEach((t) => { t.enabled = next; });
      mediaStateRef.current.video = next;
      setLocalVideoOn(next);
      sendMediaState();
    } else {
      const { videoDeviceId } = devicesRef.current;
      const constraint = videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true;
      navigator.mediaDevices.getUserMedia({ video: constraint })
        .then((newStream) => {
          const track = newStream.getVideoTracks()[0];
          if (!track || !localStreamRef.current) return;
          const stream = localStreamRef.current;
          stream.addTrack(track);
          // Rebuild state stream so React sees the new track.
          setLocalStream(new MediaStream(stream.getTracks()));
          pcsRef.current.forEach((pc) => pc.addTrack(track, stream));
          mediaStateRef.current.video = true;
          setLocalVideoOn(true);
          setHasCamera(true);
          sendMediaState();
        })
        .catch((err: unknown) => console.warn('[webrtc] camera still unavailable:', errorName(err)));
    }
  }, [sendMediaState]);

  useEffect(() => {
    let cancelled = false;
    const pcs = pcsRef.current;
    const pendingCandidates = pendingCandidatesRef.current;

    function getOrCreatePeer(peerId: string): RTCPeerConnection {
      const existing = pcs.get(peerId);
      if (existing) return existing;

      const pc = createPeerConnection();

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('webrtc-ice-candidate', { to: peerId, candidate: e.candidate });
        }
      };

      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (!stream) return;
        setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
      };

      // M3.3: renegotiation when a new track is added mid-call.
      pc.onnegotiationneeded = async () => {
        if (pc.signalingState !== 'stable') return;
        try {
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { to: peerId, description: pc.localDescription! });
        } catch (err) {
          console.warn('[webrtc] renegotiation offer failed:', err);
        }
      };

      // M3.4: track connection state per peer.
      pc.onconnectionstatechange = () => {
        setPeerConnectionStates((prev) => ({ ...prev, [peerId]: pc.connectionState }));
      };

      pcs.set(peerId, pc);
      return pc;
    }

    async function flushCandidates(peerId: string, pc: RTCPeerConnection) {
      const buffered = pendingCandidates.get(peerId);
      if (!buffered) return;
      for (const candidate of buffered) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          /* stale after teardown */
        }
      }
      pendingCandidates.delete(peerId);
    }

    function closePeer(peerId: string) {
      const pc = pcs.get(peerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onnegotiationneeded = null;
        pc.onconnectionstatechange = null;
        pc.close();
        pcs.delete(peerId);
      }
      pendingCandidates.delete(peerId);
      setRemoteStreams((prev) => {
        if (!(peerId in prev)) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      setPeerStates((prev) => {
        if (!(peerId in prev)) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      setPeerConnectionStates((prev) => {
        if (!(peerId in prev)) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }

    const onPeers = async (peers: string[]) => {
      for (const peerId of peers) {
        const pc = getOrCreatePeer(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { to: peerId, description: pc.localDescription! });
        sendMediaState(peerId);
      }
    };

    const onOffer = async ({ from, description }: WebRtcInboundRelayPayload<SessionDescriptionDto>) => {
      const pc = getOrCreatePeer(from);
      await pc.setRemoteDescription(description);
      await flushCandidates(from, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { to: from, description: pc.localDescription! });
      sendMediaState(from);
    };

    const onAnswer = async ({ from, description }: WebRtcInboundRelayPayload<SessionDescriptionDto>) => {
      const pc = pcs.get(from);
      if (!pc) return;
      await pc.setRemoteDescription(description);
      await flushCandidates(from, pc);
    };

    const onIceCandidate = async ({ from, candidate }: WebRtcInboundCandidatePayload) => {
      const pc = pcs.get(from);
      if (pc?.remoteDescription?.type) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          /* ignore */
        }
      } else {
        const buffered = pendingCandidates.get(from) ?? [];
        buffered.push(candidate);
        pendingCandidates.set(from, buffered);
      }
    };

    const onMediaState = ({ socketId, user, video, audio }: Required<Pick<WebRtcMediaStatePayload, 'socketId' | 'video' | 'audio'>> & Pick<WebRtcMediaStatePayload, 'user'>) => {
      setPeerStates((prev) => ({
        ...prev,
        [socketId]: { video, audio, name: user?.name, avatar: user?.avatar },
      }));
    };

    const onPeerLeft = ({ socketId }: { socketId: string }) => closePeer(socketId);

    async function init() {
      const { videoDeviceId, audioDeviceId, startVideoOn = true, startAudioOn = true } = devicesRef.current;
      const stream = new MediaStream();

      // Always acquire the track so hasMic/hasCamera reflect physical availability.
      // start*On only controls track.enabled — muted ≠ no device.
      try {
        const audioConstraint = audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true;
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
        audioStream.getAudioTracks().forEach((t) => {
          t.enabled = startAudioOn;
          stream.addTrack(t);
        });
      } catch (err: unknown) {
        console.warn('[webrtc] microphone unavailable:', errorName(err));
      }

      try {
        const videoConstraint = videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true;
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraint });
        videoStream.getVideoTracks().forEach((t) => {
          t.enabled = startVideoOn;
          stream.addTrack(t);
        });
      } catch (err: unknown) {
        console.warn('[webrtc] camera unavailable:', errorName(err));
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const hasMicTrack = stream.getAudioTracks().length > 0;
      const hasCamTrack = stream.getVideoTracks().length > 0;
      // enabled reflects lobby toggle — track may exist but start muted/off.
      const audioIsOn = hasMicTrack && stream.getAudioTracks()[0].enabled;
      const videoIsOn = hasCamTrack && stream.getVideoTracks()[0].enabled;
      mediaStateRef.current = { video: videoIsOn, audio: audioIsOn };

      localStreamRef.current = stream;
      setLocalStream(stream);
      setHasMic(hasMicTrack);
      setHasCamera(hasCamTrack);
      setLocalAudioOn(audioIsOn);
      setLocalVideoOn(videoIsOn);

      socket.on('webrtc-peers', onPeers);
      socket.on('webrtc-offer', onOffer);
      socket.on('webrtc-answer', onAnswer);
      socket.on('webrtc-ice-candidate', onIceCandidate);
      socket.on('webrtc-media-state', onMediaState);
      socket.on('webrtc-peer-left', onPeerLeft);

      socket.emit('webrtc-ready', roomId);
    }

    init();

    return () => {
      cancelled = true;
      socket.off('webrtc-peers', onPeers);
      socket.off('webrtc-offer', onOffer);
      socket.off('webrtc-answer', onAnswer);
      socket.off('webrtc-ice-candidate', onIceCandidate);
      socket.off('webrtc-media-state', onMediaState);
      socket.off('webrtc-peer-left', onPeerLeft);

      pcs.forEach((pc) => {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onnegotiationneeded = null;
        pc.onconnectionstatechange = null;
        pc.close();
      });
      pcs.clear();
      pendingCandidates.clear();

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;

      setRemoteStreams({});
      setPeerStates({});
      setPeerConnectionStates({});
      setLocalStream(null);
    };
  }, [roomId, sendMediaState]);

  return {
    localStream,
    remoteStreams,
    peerStates,
    peerConnectionStates,
    localVideoOn,
    localAudioOn,
    hasCamera,
    hasMic,
    toggleVideo,
    toggleAudio,
  };
}

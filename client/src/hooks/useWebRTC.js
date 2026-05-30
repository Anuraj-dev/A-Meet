import { useCallback, useEffect, useRef, useState } from 'react';
import socket from '../services/socket';
import { createPeerConnection } from '../services/webrtc';

// Orchestrates a hand-built WebRTC mesh (1:1 for M2, but the logic is per-peer
// so it generalises). Returns local media + controls plus a map of remote
// streams (keyed by socketId) and each peer's camera/mic on-off state.
//
// Resilient media acquisition: we request audio and video SEPARATELY so a busy
// camera (e.g. a second tab on the same machine) only costs us video — the mic
// still works. If everything fails we still join, sending no tracks, so the
// peer connects and shows a placeholder. Never bail out of signaling.
//
// Signaling flow (newcomer-initiates, so there's no offer glare to resolve):
//   1. acquire local media → 2. emit `webrtc-ready` → server replies
//   `webrtc-peers` → 3. offer each existing peer → 4/5. answer/answer-handling
//   → 6. trickle ICE (buffer candidates that beat the remote description).
//
// NOTE: the socket connect/join/disconnect lifecycle is owned by RoomPage's
// chat effect. This hook only registers its own WebRTC listeners.
export function useWebRTC(roomId) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // socketId → MediaStream
  const [peerStates, setPeerStates] = useState({}); // socketId → { video, audio, name, avatar }
  const [localVideoOn, setLocalVideoOn] = useState(false);
  const [localAudioOn, setLocalAudioOn] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMic, setHasMic] = useState(false);

  const localStreamRef = useRef(null);
  const pcsRef = useRef(new Map()); // socketId → RTCPeerConnection
  const pendingCandidatesRef = useRef(new Map()); // socketId → RTCIceCandidateInit[]
  // Latest on/off state, read by signaling handlers without stale closures.
  const mediaStateRef = useRef({ video: false, audio: false });

  const sendMediaState = useCallback((to) => {
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
    sendMediaState(); // broadcast to room
  }, [sendMediaState]);

  const toggleVideo = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = next; });
    mediaStateRef.current.video = next;
    setLocalVideoOn(next);
    sendMediaState(); // broadcast to room
  }, [sendMediaState]);

  useEffect(() => {
    let cancelled = false;
    // Stable Map identities for the effect's lifetime — captured so the cleanup
    // closure references them directly (not `ref.current` read at teardown time).
    const pcs = pcsRef.current;
    const pendingCandidates = pendingCandidatesRef.current;

    function getOrCreatePeer(peerId) {
      const existing = pcs.get(peerId);
      if (existing) return existing;

      const pc = createPeerConnection();

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
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

      pcs.set(peerId, pc);
      return pc;
    }

    async function flushCandidates(peerId, pc) {
      const buffered = pendingCandidates.get(peerId);
      if (!buffered) return;
      for (const candidate of buffered) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          /* candidate may be stale after teardown — ignore */
        }
      }
      pendingCandidates.delete(peerId);
    }

    function closePeer(peerId) {
      const pc = pcs.get(peerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
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
    }

    // --- WebRTC signaling listeners ---

    const onPeers = async (peers) => {
      for (const peerId of peers) {
        const pc = getOrCreatePeer(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { to: peerId, description: pc.localDescription });
        sendMediaState(peerId); // tell this peer our current cam/mic state
      }
    };

    const onOffer = async ({ from, description }) => {
      const pc = getOrCreatePeer(from);
      await pc.setRemoteDescription(description);
      await flushCandidates(from, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { to: from, description: pc.localDescription });
      sendMediaState(from); // and let them know our state too
    };

    const onAnswer = async ({ from, description }) => {
      const pc = pcs.get(from);
      if (!pc) return;
      await pc.setRemoteDescription(description);
      await flushCandidates(from, pc);
    };

    const onIceCandidate = async ({ from, candidate }) => {
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

    const onMediaState = ({ socketId, user, video, audio }) => {
      setPeerStates((prev) => ({
        ...prev,
        [socketId]: { video, audio, name: user?.name, avatar: user?.avatar },
      }));
    };

    const onPeerLeft = ({ socketId }) => closePeer(socketId);

    async function init() {
      // Acquire audio + video independently — one failing must not sink the other.
      const stream = new MediaStream();
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch (err) {
        console.warn('[webrtc] microphone unavailable:', err.name);
      }
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoStream.getVideoTracks().forEach((t) => stream.addTrack(t));
      } catch (err) {
        console.warn('[webrtc] camera unavailable (likely in use by another tab):', err.name);
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const audioOn = stream.getAudioTracks().length > 0;
      const videoOn = stream.getVideoTracks().length > 0;
      mediaStateRef.current = { video: videoOn, audio: audioOn };

      localStreamRef.current = stream;
      setLocalStream(stream);
      setHasMic(audioOn);
      setHasCamera(videoOn);
      setLocalAudioOn(audioOn);
      setLocalVideoOn(videoOn);

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
        pc.close();
      });
      pcs.clear();
      pendingCandidates.clear();

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;

      setRemoteStreams({});
      setPeerStates({});
      setLocalStream(null);
    };
  }, [roomId, sendMediaState]);

  return {
    localStream,
    remoteStreams,
    peerStates,
    localVideoOn,
    localAudioOn,
    hasCamera,
    hasMic,
    toggleVideo,
    toggleAudio,
  };
}

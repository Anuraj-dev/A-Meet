import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Alert, Avatar, AvatarGroup, Box, Button, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Popover,
  Snackbar, Stack, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import {
  ContentCopy as ContentCopyIcon,
  NavigateBefore as NavigateBeforeIcon,
  NavigateNext as NavigateNextIcon,
  PeopleAlt as PeopleAltIcon,
  StopScreenShare as StopScreenShareIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { RoomMetaContext } from '../components/RoomGuard';
import socket from '../services/socket';
import { useMediasoup } from '../hooks/useMediasoup';
import { usePictureInPicture } from '../hooks/usePictureInPicture';
import { isPcmCaptureSupported, usePcmCapture } from '../hooks/usePcmCapture';
import { useReactions } from '../hooks/useReactions';
import { useScreenShare } from '../hooks/useScreenShare';
import VideoTile from '../components/VideoTile';
import RemoteAudio from '../components/RemoteAudio';
import RtcStatsOverlay from '../components/RtcStatsOverlay';
import ControlBar from '../components/ControlBar';
import ChatPanel from '../components/ChatPanel';
import PeoplePanel from '../components/PeoplePanel';
import TranscriptPanel from '../components/TranscriptPanel';
import LiveCaptions from '../components/LiveCaptions';
import CallNotifications from '../components/CallNotifications';
import ReactionsOverlay from '../components/ReactionsOverlay';
import { playSound, isSoundEnabled, toggleSound } from '../services/sounds';
import { copyMeetingScreenshot, downloadMeetingScreenshot } from '../utils/capture-screenshot';
import { appLogger } from '../utils/logger';
import { downloadTranscript, mergeTranscriptEntries } from '../utils/transcript';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🎉'];
const TRANSCRIPT_CONSENT_KEY = 'ameet:transcription-consent-v2';

function hasTranscriptConsent() {
  try { return localStorage.getItem(TRANSCRIPT_CONSENT_KEY) === 'accepted'; }
  catch { return false; }
}

// Local clock so the header time updates without re-rendering the call.
function LiveClock(props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <Typography {...props}>
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </Typography>
  );
}

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { state: locationState } = useLocation();
  const { user } = useAuth();
  const isMobile = useMediaQuery((t) => t.breakpoints.down('sm'));
  const roomMeta = useContext(RoomMetaContext);
  const meetingTitle = roomMeta?.title || null;

  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState('');
  // Single right rail: only one of Chat / People / Transcript is open at a time (Meet-style).
  const [activePanel, setActivePanel] = useState(null); // 'chat' | 'people' | 'transcript' | null
  const showChat = activePanel === 'chat';
  const showPeople = activePanel === 'people';
  const showTranscript = activePanel === 'transcript';
  const [transcriptState, setTranscriptState] = useState({
    active: false, startedAt: null, startedBy: null, stoppedAt: null,
  });
  const [transcriptEntries, setTranscriptEntries] = useState([]);
  const [transcriptConfigured, setTranscriptConfigured] = useState(null);
  const [transcriptInterims, setTranscriptInterims] = useState({});
  const [contributorState, setContributorState] = useState({ status: 'idle', provider: null, error: '' });
  const [transcriptConsent, setTranscriptConsent] = useState(hasTranscriptConsent);
  const [transcriptConsentOpen, setTranscriptConsentOpen] = useState(false);
  const pendingTranscriptStartRef = useRef(false);
  const [latestCaption, setLatestCaption] = useState(null);
  const captionTimerRef = useRef(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // Focus model: a LOCAL pin (just for me, any participant) and a host SPOTLIGHT
  // (server-relayed, applies to everyone). Spotlight wins when both are set.
  const [pinnedKey, setPinnedKey] = useState(null);
  const [spotlightKey, setSpotlightKey] = useState(null);
  // Layout chooser: 'auto' keeps the smart alone/solo/grid behaviour.
  const [layoutMode, setLayoutMode] = useState('auto'); // auto | tiled | spotlight | sidebar
  const [gridPage, setGridPage] = useState(0); // grid pagination for large calls
  // Host asked us to unmute — surfaced as a one-tap prompt (never forced).
  const [unmuteRequestFrom, setUnmuteRequestFrom] = useState(null);
  const [reactionAnchor, setReactionAnchor] = useState(null);
  const [outputVolume, setOutputVolume] = useState(1);
  const [peerVolumes, setPeerVolumes] = useState({});
  const [controlsPinned, setControlsPinned] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef(null);
  const [meetingEndedSnack, setMeetingEndedSnack] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => isSoundEnabled());
  const [isHost, setIsHost] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  // Bottom-left transient flashes: join/leave, chat previews, copy confirmation.
  const [notes, setNotes] = useState([]);
  const noteIdRef = useRef(0);
  const noteTimers = useRef({});
  // Live refs so the mount-only socket effect always sees current values
  // (auth may resolve after mount; chat-open state changes over the call).
  const userIdRef = useRef(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);
  const showChatRef = useRef(false);
  useEffect(() => { showChatRef.current = showChat; }, [showChat]);
  // Refs for stale-closure–safe reads inside the mount-only socket effect
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const peerStatesRef = useRef({});

  // Reaction feature (per-tile + floating stream + sound) lives in its own hook.
  const { activeReactions, floatingReactions, sendReaction } = useReactions({
    socket,
    userRef,
    peerStatesRef,
  });
  // Plays the join chime once for THIS user on their own entry. Guarded so the
  // re-`room-users` we receive on every reconnect (network blip) doesn't replay
  // it — Meet only chimes when you actually arrive, not on each reconnect.
  const selfJoinChimeRef = useRef(false);

  // The backend persists the creator as the meeting's admin. Re-evaluate this
  // on every room/user change (including a leave + rejoin) instead of relying
  // on transient socket membership.
  useEffect(() => {
    let active = true;
    fetch(`/api/rooms/${roomId}`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!active) return;
        const adminId = data?.admin?._id ?? data?.admin?.id ?? data?.host?._id ?? data?.host?.id;
        setIsHost(Boolean(user?.id && adminId && String(adminId) === String(user.id)));
      })
      .catch(() => { if (active) setIsHost(false); });
    return () => { active = false; };
  }, [roomId, user?.id]);

  // Push a transient notification; auto-dismisses after `duration` ms.
  const pushNote = useCallback((note) => {
    const id = (noteIdRef.current += 1);
    setNotes((prev) => {
      const next = [...prev, { id, ...note }];
      // Cap at the 4 most recent; clear timers for any we evict so they
      // don't linger and fire against a note that's no longer shown.
      while (next.length > 4) {
        const evicted = next.shift();
        clearTimeout(noteTimers.current[evicted.id]);
        delete noteTimers.current[evicted.id];
      }
      return next;
    });
    noteTimers.current[id] = setTimeout(() => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      delete noteTimers.current[id];
    }, note.duration ?? 4500);
  }, []);

  const dismissNote = useCallback((id) => {
    clearTimeout(noteTimers.current[id]);
    delete noteTimers.current[id];
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Clear any pending note timers on unmount.
  useEffect(() => {
    const timers = noteTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  const devices = {
    videoDeviceId: locationState?.videoDeviceId ?? null,
    audioDeviceId: locationState?.audioDeviceId ?? null,
    startVideoOn: locationState?.startVideoOn ?? true,
    startAudioOn: locationState?.startAudioOn ?? true,
  };

  const {
    localStream, remoteStreams, remoteScreens, peerStates, peerConnectionStates,
    localVideoOn, localAudioOn, hasMic,
    toggleVideo, toggleAudio,
    isScreenSharing, localScreenStream, localScreenSurface, shareScreen, stopScreenShare,
    micGain, setMicGain,
    handRaised, toggleHand,
    activeSpeaker, socketConnected, permissionDenied, rtcStats,
  } = useMediasoup(roomId, devices);

  const sendTranscriptAudio = useCallback((audio) => {
    socket.emit('transcript-audio', audio);
  }, []);
  const audioTrack = localStream?.getAudioTracks()[0] ?? null;
  const shouldContributeTranscript = !!transcriptConfigured
    && transcriptState.active && transcriptConsent && localAudioOn;
  const pcmCapture = usePcmCapture({
    enabled: shouldContributeTranscript,
    audioTrack: localAudioOn ? audioTrack : null,
    onChunk: sendTranscriptAudio,
  });
  const transcriptInterimList = Object.values(transcriptInterims).sort((a, b) => a.ts - b.ts);
  const latestInterim = transcriptInterimList[transcriptInterimList.length - 1] ?? null;

  useEffect(() => {
    if (!shouldContributeTranscript || !pcmCapture.supported) return undefined;
    let cancelled = false;
    socket.emit('transcript-contributor-start', {}, (response) => {
      if (cancelled || !response?.error) return;
      setContributorState({ status: 'error', provider: null, error: response.error });
      appLogger.warn('transcript-contributor-start-failed', { error: response.error });
    });
    return () => {
      cancelled = true;
      socket.emit('transcript-contributor-stop');
    };
  }, [shouldContributeTranscript, pcmCapture.supported, roomId]);

  // Keep peerStatesRef in sync so the mount-only socket effect can read fresh state
  useEffect(() => { peerStatesRef.current = peerStates; }, [peerStates]);

  const remoteEntries = Object.entries(remoteStreams);
  const remoteScreenEntries = Object.entries(remoteScreens);
  const isSoloCall = remoteEntries.length === 1 && remoteScreenEntries.length === 0 && !isScreenSharing;
  const isAlone = remoteEntries.length === 0 && !isScreenSharing;

  // Screen-share / presentation concern (unified shares model, pinned-share
  // selection, infinity-mirror reveal) lives in useScreenShare.
  const {
    shares, pinnedShare, setPinnedShareKey, hasScreen,
    showScreenAnyway, setShowScreenAnyway,
  } = useScreenShare({
    remoteScreens, isScreenSharing, localScreenStream, localScreenSurface,
    peerStates, localName: user?.name ?? 'You',
  });

  // Composite every camera tile into a Picture-in-Picture "mini player" so
  // participants stay visible after switching tabs.
  const camTiles = cameraTiles();
  const { pipSupported, pipActive, togglePiP } = usePictureInPicture(camTiles, { auto: true });

  // Controls auto-hide during screen share
  const controlsShown = !hasScreen || controlsPinned || controlsVisible;
  const handleStageMouseMove = () => {
    if (!hasScreen) return;
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  };
  // Reset controls when screen share ends
  useEffect(() => {
    if (!hasScreen) {
      setControlsVisible(true);
      clearTimeout(hideTimer.current);
    }
  }, [hasScreen]);

  useEffect(() => {
    // Presence membership must be (re)claimed on EVERY connect, not just once.
    // After a dropped connection (network blip, server restart) Socket.IO
    // reconnects with a fresh socket; the server dropped us from the room on the
    // old socket's disconnect, so without re-emitting join-room we'd silently
    // vanish from everyone's participant list (and never receive theirs) — the
    // SFU media path rejoins on reconnect but plain presence did not. The server
    // bridges brief blips with a leave grace window, so a quick reconnect stays
    // seamless for peers. Emitting on `connect` covers the first join too.
    const joinRoom = () => socket.emit('join-room', roomId);
    socket.on('connect', joinRoom);
    if (socket.connected) joinRoom();
    socket.connect();

    socket.on('room-users', (list) => {
      setUsers(list);
      // Chime for our own arrival (Meet plays the join sound when YOU enter too).
      // Only the joiner receives room-users, and we fire just once per visit.
      if (!selfJoinChimeRef.current) {
        selfJoinChimeRef.current = true;
        playSound('join');
      }
    });
    socket.on('user-joined', (u) => {
      setUsers((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]));
      setMessages((prev) => [...prev, { type: 'event', text: `${u.name} joined`, ts: Date.now() }]);
      pushNote({ kind: 'event', variant: 'join', name: u.name, avatar: u.avatar });
      playSound('join');
    });
    socket.on('user-left', (u) => {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setMessages((prev) => [...prev, { type: 'event', text: `${u.name} left`, ts: Date.now() }]);
      pushNote({ kind: 'event', variant: 'leave', name: u.name, avatar: u.avatar });
      playSound('leave');
      setTranscriptInterims((current) => Object.fromEntries(
        Object.entries(current).filter(([, interim]) => interim.speaker?.id !== u.id),
      ));
    });
    socket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev, { type: 'chat', ...msg }]);
      const fromOther = msg.sender?.id !== userIdRef.current;
      if (fromOther) playSound('message');
      // When the chat is closed, surface a Meet-style preview + unread badge.
      if (fromOther && !showChatRef.current) {
        setUnreadCount((n) => n + 1);
        pushNote({
          kind: 'chat',
          name: msg.sender?.name,
          avatar: msg.sender?.avatar,
          text: msg.text,
          duration: 6000,
        });
      }
    });
    socket.on('transcript-snapshot', (snapshot) => {
      setTranscriptState({
        active: !!snapshot.active,
        startedAt: snapshot.startedAt ?? null,
        startedBy: snapshot.startedBy ?? null,
        stoppedAt: snapshot.stoppedAt ?? null,
      });
      setTranscriptEntries((current) => mergeTranscriptEntries(current, snapshot.entries ?? []));
      setTranscriptConfigured(!!snapshot.configured);
      if (snapshot.active
          && !hasTranscriptConsent()
          && isPcmCaptureSupported()) {
        setTranscriptConsentOpen(true);
      }
    });
    socket.on('transcript-state', (state) => {
      setTranscriptState(state);
      setTranscriptInterims({});
      if (state.active) {
        setActivePanel('transcript');
        if (!hasTranscriptConsent()
            && isPcmCaptureSupported()) {
          setTranscriptConsentOpen(true);
        }
      }
    });
    socket.on('transcript-segment', (entry) => {
      setTranscriptEntries((current) => mergeTranscriptEntries(current, [entry]));
      setLatestCaption(entry);
      clearTimeout(captionTimerRef.current);
      captionTimerRef.current = setTimeout(() => setLatestCaption(null), 6500);
    });
    socket.on('transcript-interim', (interim) => {
      setTranscriptInterims((current) => {
        const next = { ...current };
        if (interim.text) next[interim.utteranceId] = interim;
        else delete next[interim.utteranceId];
        return next;
      });
    });
    socket.on('transcript-contributor-state', (state) => {
      setContributorState({
        status: state.status,
        provider: state.provider ?? null,
        error: state.message ?? '',
      });
    });
    socket.on('sfu-meeting-ended', () => {
      setMeetingEndedSnack(true);
      setTimeout(() => navigate('/'), 2500);
    });
    // The `sfu-reaction` subscription lives in the useReactions hook.
    // Separate listener purely for the raise-hand cue (peers only; server
    // excludes the sender, so this never fires for our own toggle). Removed by
    // reference so we don't also detach useMediasoup's own listener.
    const onPeerHandRaise = ({ raised }) => { if (raised) playSound('raiseHand'); };
    socket.on('sfu-hand-raise-update', onPeerHandRaise);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('room-users');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('chat-message');
      socket.off('transcript-snapshot');
      socket.off('transcript-state');
      socket.off('transcript-segment');
      socket.off('transcript-interim');
      socket.off('transcript-contributor-state');
      socket.off('sfu-meeting-ended');
      socket.off('sfu-hand-raise-update', onPeerHandRaise);
      // Announce an intentional leave so peers see it instantly (this cleanup
      // runs on in-app navigation away — the "Leave call" button — not on a
      // reconnect blip, where the page stays mounted). A reload/tab-close skips
      // this and falls back to the server's leave grace window. Best-effort: if
      // the packet doesn't flush before disconnect, the grace window still covers it.
      socket.emit('leave-room', roomId);
      socket.disconnect();
      clearTimeout(captionTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Host-moderation + spotlight listeners (M12). Separate from the mount-only
  // socket effect so they can close over fresh `localAudioOn` / `toggleAudio`.
  useEffect(() => {
    const onForceMuted = () => {
      if (localAudioOn) { playSound('toggleOff'); toggleAudio(); }
      pushNote({ kind: 'event', variant: 'info', text: 'You were muted by the meeting admin' });
    };
    const onUnmuteRequest = ({ by } = {}) => setUnmuteRequestFrom(by ?? 'The meeting admin');
    const onRemoved = () => {
      playSound('callEnd');
      setMeetingEndedSnack(false);
      navigate('/', { state: { removed: true } });
    };
    const onSpotlight = ({ socketId } = {}) => setSpotlightKey(socketId ?? null);
    socket.on('sfu-force-muted', onForceMuted);
    socket.on('sfu-unmute-request', onUnmuteRequest);
    socket.on('sfu-removed', onRemoved);
    socket.on('sfu-spotlight', onSpotlight);
    return () => {
      socket.off('sfu-force-muted', onForceMuted);
      socket.off('sfu-unmute-request', onUnmuteRequest);
      socket.off('sfu-removed', onRemoved);
      socket.off('sfu-spotlight', onSpotlight);
    };
  }, [localAudioOn, toggleAudio, navigate, pushNote]);

  const handleToggleChat = () => {
    setActivePanel((p) => {
      const next = p === 'chat' ? null : 'chat';
      if (next === 'chat') setUnreadCount(0); // clear unread when opening
      return next;
    });
  };
  const handleTogglePeople = () => {
    setActivePanel((p) => (p === 'people' ? null : 'people'));
  };
  const openChat = () => { setActivePanel('chat'); setUnreadCount(0); };

  function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    socket.emit('chat-message', { roomId, text });
    setInput('');
  }


  function requestTranscriptStart() {
    socket.emit('transcript-start', {}, (response) => {
      if (response?.error) {
        pushNote({ kind: 'event', variant: 'info', text: response.error });
        return;
      }
      setActivePanel('transcript');
    });
  }

  function handleToggleTranscript() {
    if (transcriptState.active || transcriptEntries.length > 0) {
      setActivePanel((p) => (p === 'transcript' ? null : 'transcript'));
      if (!transcriptConsent && pcmCapture.supported) setTranscriptConsentOpen(true);
      return;
    }
    if (!isHost) return;
    if (!transcriptConfigured) {
      pushNote({ kind: 'event', variant: 'info', text: 'The server transcription providers are not configured.' });
      return;
    }
    if (!pcmCapture.supported) {
      pushNote({ kind: 'event', variant: 'info', text: 'This browser cannot stream microphone audio for transcription.' });
      return;
    }
    if (!transcriptConsent) {
      pendingTranscriptStartRef.current = true;
      setTranscriptConsentOpen(true);
      return;
    }
    requestTranscriptStart();
  }

  function acceptTranscriptConsent() {
    try { localStorage.setItem(TRANSCRIPT_CONSENT_KEY, 'accepted'); } catch { /* session-only consent */ }
    setTranscriptConsent(true);
    setTranscriptConsentOpen(false);
    if (pendingTranscriptStartRef.current) requestTranscriptStart();
    pendingTranscriptStartRef.current = false;
  }

  function declineTranscriptConsent() {
    pendingTranscriptStartRef.current = false;
    setTranscriptConsentOpen(false);
  }

  function stopSharedTranscript() {
    socket.emit('transcript-stop', {}, (response) => {
      if (response?.error) pushNote({ kind: 'event', variant: 'info', text: response.error });
    });
  }

  function handleDownloadTranscript() {
    downloadTranscript({ entries: transcriptEntries, roomId, meetingTitle });
    pushNote({ kind: 'event', variant: 'info', text: 'Shared transcript downloaded' });
  }

  const handlePeerVolumeChange = useCallback((peerId, name, volume) => {
    setPeerVolumes((prev) => ({ ...prev, [peerId]: volume }));
    appLogger.info('peer-volume-changed', { peerId, name, pct: Math.round(volume * 100) });
  }, []);

  // --- Local-action wrappers that add sound feedback ---
  const handleToggleAudio = () => { playSound(localAudioOn ? 'toggleOff' : 'toggleOn'); toggleAudio(); };
  const handleToggleVideo = () => { playSound(localVideoOn ? 'toggleOff' : 'toggleOn'); toggleVideo(); };
  const handleToggleHand = () => { if (!handRaised) playSound('raiseHand'); toggleHand(); };
  const handleToggleShare = () => {
    if (isScreenSharing) { playSound('shareStop'); stopScreenShare(); }
    else { playSound('shareStart'); shareScreen(); }
  };
  const doLeave = (endForAll = false) => {
    playSound('callEnd');
    if (endForAll) socket.emit('sfu-end-meeting');
    navigate('/');
  };
  const handleLeave = () => {
    if (isHost) { setLeaveDialogOpen(true); return; }
    doLeave(false);
  };
  const handleToggleSound = () => setSoundEnabled(toggleSound());
  const handleTogglePip = () => {
    togglePiP().catch(() =>
      pushNote({ kind: 'event', variant: 'info', text: "Couldn't open the mini player" }),
    );
  };
  // Capture the current meeting view (camera tiles + any on-stage share) and
  // copy it to the clipboard as a PNG. Falls back to a file download when the
  // browser can't write images to the clipboard (e.g. Firefox).
  async function handleScreenshot() {
    const tiles = cameraTiles().map(({ key, stream, name, videoOn, audioOn, mirror }) =>
      ({ key, stream, name, videoOn, audioOn, mirror }));
    // Prefix the share key so it can't collide with the 'local' camera tile.
    const share = pinnedShare
      ? { key: `share-${pinnedShare.key}`, stream: pinnedShare.stream, name: pinnedShare.name }
      : null;
    try {
      await copyMeetingScreenshot({ tiles, share });
      playSound('toggleOn');
      pushNote({ kind: 'event', variant: 'info', text: 'Screenshot copied to clipboard' });
    } catch {
      try {
        await downloadMeetingScreenshot({ tiles, share }, `a-meet-${roomId}`);
        pushNote({ kind: 'event', variant: 'info', text: 'Screenshot saved' });
      } catch {
        pushNote({ kind: 'event', variant: 'info', text: "Couldn't capture a screenshot" });
      }
    }
  }

  async function handleCopyLink() {
    const link = `${window.location.origin}/lobby/${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
      pushNote({ kind: 'event', variant: 'info', text: 'Joining link copied' });
    } catch {
      pushNote({ kind: 'event', variant: 'info', text: 'Press the link button to copy' });
    }
  }

  // --- Camera tiles (shared by presentation rail) ---
  function cameraTiles() {
    const all = [
      localStream && {
        key: 'local',
        stream: localStream,
        audioStream: localStream,
        muted: true,
        name: `${user?.name ?? 'You'} (You)`,
        avatar: user?.avatar,
        videoOn: localVideoOn,
        audioOn: localAudioOn,
        handRaised: handRaised,
        activeReaction: activeReactions[socket.id],
        activeSpeaker: activeSpeaker === socket.id,
        mirror: true,
        pinned: pinnedKey === socket.id,
        onPin: () => handlePin({ id: socket.id }),
        spotlighted: spotlightKey === socket.id,
        canSpotlight: isHost,
        onSpotlight: () => handleSpotlight({ id: socket.id }),
      },
      ...remoteEntries.map(([peerId, stream]) => {
        const ps = peerStates[peerId];
        return {
          key: peerId,
          stream,
          audioStream: stream,
          // Audio plays via the dedicated <RemoteAudio> sink, so the tile's
          // <video> is muted to avoid double audio.
          muted: true,
          name: ps?.name ?? 'Participant',
          avatar: ps?.avatar,
          videoOn: ps ? ps.video : stream.getVideoTracks().length > 0,
          audioOn: ps ? ps.audio : true,
          connectionState: peerConnectionStates[peerId],
          handRaised: ps?.handRaised ?? false,
          activeReaction: activeReactions[peerId],
          activeSpeaker: activeSpeaker === peerId,
          showVolumeControl: true,
          peerVolume: peerVolumes[peerId] ?? 1,
          onPeerVolumeChange: (v) => handlePeerVolumeChange(peerId, ps?.name ?? 'Participant', v),
          pinned: pinnedKey === peerId,
          onPin: () => handlePin({ id: peerId }),
          spotlighted: spotlightKey === peerId,
          canSpotlight: isHost,
          onSpotlight: () => handleSpotlight({ id: peerId }),
        };
      }),
    ].filter(Boolean);
    // Raised-hand participants pin to the top of the sidebar/grid (stable sort).
    return all.sort((a, b) => (b.handRaised ? 1 : 0) - (a.handRaised ? 1 : 0));
  }

  // --- Layouts ---

  // When the user is alone: show their own camera tile full-screen so the call
  // doesn't feel like an empty room. Overlay an invite prompt above the control bar.
  function renderAloneLayout() {
    return (
      <Box sx={{ position: 'absolute', inset: 0 }}>
        {localStream ? (
          <VideoTile
            stream={localStream}
            audioStream={localStream}
            muted
            name={`${user?.name ?? 'You'} (You)`}
            avatar={user?.avatar}
            videoOn={localVideoOn}
            audioOn={localAudioOn}
            handRaised={handRaised}
            activeReaction={activeReactions[socket.id]}
            activeSpeaker={activeSpeaker === socket.id}
            mirror
            objectFit="cover"
          />
        ) : (
          <Box sx={{ width: '100%', height: '100%', bgcolor: 'background.paper' }} />
        )}
        {/* Invite nudge — floats above the control bar */}
        <Box
          sx={{
            position: 'absolute',
            bottom: { xs: 96, sm: 116 },
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            pointerEvents: 'none',
            width: 'max-content',
            maxWidth: '90vw',
          }}
        >
          <Box
            sx={{
              bgcolor: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(12px)',
              borderRadius: 3,
              px: 3,
              py: 1.5,
            }}
          >
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#fff' }}>
              You're the only one here
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', mt: 0.25 }}>
              Share the joining link to invite others to the call.
            </Typography>
          </Box>
          <Chip
            icon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
            label={`Copy link · ${roomId}`}
            onClick={handleCopyLink}
            sx={{
              bgcolor: 'rgba(255,255,255,0.1)',
              color: '#fff',
              backdropFilter: 'blur(8px)',
              py: 2,
              px: 0.5,
              fontWeight: 500,
              pointerEvents: 'auto',
              cursor: 'pointer',
              '& .MuiChip-icon': { color: 'rgba(255,255,255,0.7)' },
              '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' },
            }}
          />
        </Box>
      </Box>
    );
  }

  function renderPresentationLayout() {
    const tiles = cameraTiles();
    const showSwitcher = shares.length > 1;
    return (
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
        {/* Pinned screen */}
        <Box
          sx={{
            flex: 1,
            position: 'relative',
            p: { xs: 1, sm: 1.5 },
            minHeight: 0,
            minWidth: 0,
            // Reserve space for pinned control bar so screen isn't covered
            pb: controlsPinned ? { xs: 1, sm: '100px' } : { xs: 1, sm: 1.5 },
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {/* Share switcher — shown when multiple people present */}
          {showSwitcher && (
            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
              {shares.map((s) => (
                <Box
                  key={s.key}
                  onClick={() => setPinnedShareKey(s.key)}
                  sx={{
                    cursor: 'pointer',
                    px: 1.5, py: 0.5,
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 500,
                    bgcolor: pinnedShare?.key === s.key ? 'primary.main' : 'control.surface',
                    color: pinnedShare?.key === s.key ? 'primary.contrastText' : 'text.primary',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid',
                    borderColor: pinnedShare?.key === s.key ? 'primary.main' : 'glass.border',
                    transition: 'all 0.15s',
                    '&:hover': { bgcolor: pinnedShare?.key === s.key ? 'primary.main' : 'control.idleHover' },
                  }}
                >
                  {s.isLocal ? 'Your screen' : `${s.name}'s screen`}
                </Box>
              ))}
            </Box>
          )}

          <Box sx={{ flex: 1, borderRadius: 3, overflow: 'hidden', bgcolor: '#000', minHeight: 0, position: 'relative' }}>
            {pinnedShare ? (
              <>
                {/* Local monitor share → show warning card until user opts in */}
                {pinnedShare.isLocal && !showScreenAnyway ? (
                  <Box
                    sx={{
                      width: '100%', height: '100%',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: 3, px: 3,
                    }}
                  >
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: 500, color: '#fff', fontFamily: '"Outfit", sans-serif', textAlign: 'center' }}
                    >
                      You are presenting
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: 'rgba(255,255,255,0.65)', textAlign: 'center', maxWidth: 460, lineHeight: 1.7 }}
                    >
                      To avoid an infinity mirror, don't share your entire screen or browser window.
                      Share just a tab or a different window instead.
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <Button
                        variant="outlined"
                        onClick={() => setShowScreenAnyway(true)}
                        sx={{
                          borderRadius: 999, px: 3, color: '#fff',
                          borderColor: 'rgba(255,255,255,0.5)',
                          '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                        }}
                      >
                        Show my screen anyway
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={handleToggleShare}
                        sx={{
                          borderRadius: 999, px: 3, color: '#fff',
                          borderColor: 'rgba(255,255,255,0.5)',
                          '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                        }}
                      >
                        Stop presenting
                      </Button>
                    </Stack>
                  </Box>
                ) : (
                  <>
                    <VideoTile
                      stream={pinnedShare.stream}
                      muted={pinnedShare.isLocal}
                      name={pinnedShare.isLocal ? 'Your screen' : `${pinnedShare.name}'s screen`}
                      videoOn
                      audioOn
                      objectFit="contain"
                    />
                    {pinnedShare.isLocal && (
                      <Box
                        component="button"
                        onClick={handleToggleShare}
                        sx={{
                          position: 'absolute', bottom: 14, left: '50%',
                          transform: 'translateX(-50%)',
                          display: 'flex', alignItems: 'center', gap: 0.75,
                          px: 2.5, py: 0.75, border: 'none', borderRadius: 999,
                          bgcolor: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer',
                          fontSize: 13, fontWeight: 600,
                          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                          zIndex: 2, transition: 'background 0.15s',
                          '&:hover': { bgcolor: 'rgba(180,0,0,0.88)' },
                        }}
                      >
                        <StopScreenShareIcon sx={{ fontSize: 16 }} />
                        Stop presenting
                      </Box>
                    )}
                  </>
                )}
              </>
            ) : (
              <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.disabled">No screen to display</Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Camera rail — right column on desktop, top strip on mobile */}
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            p: 1,
            flexShrink: 0,
            order: { xs: -1, sm: 0 },
            width: { xs: '100%', sm: 184 },
            height: { xs: 92, sm: 'auto' },
            flexDirection: { xs: 'row', sm: 'column' },
            overflowX: { xs: 'auto', sm: 'visible' },
            overflowY: { xs: 'visible', sm: 'auto' },
            pt: { xs: 0, sm: 7 }, // clear the top overlay on desktop (M7.7)
            pb: { sm: 13 },       // clear the floating control bar on desktop
          }}
        >
          {tiles.map(({ key, audioStream: tileAudioStream, ...t }) => (
            <Box
              key={key}
              sx={{
                flexShrink: 0,
                width: { xs: 140, sm: '100%' },
                height: { xs: '100%', sm: 'auto' },
                aspectRatio: { sm: '16/9' },
                borderRadius: '16px',
                overflow: 'hidden',
              }}
            >
              <VideoTile {...t} audioStream={tileAudioStream} />
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  function renderSoloLayout() {
    const [peerId, stream] = remoteEntries[0];
    const ps = peerStates[peerId];
    return (
      <Box sx={{ position: 'absolute', inset: 0 }}>
        <VideoTile
          stream={stream}
          audioStream={stream}
          muted
          name={ps?.name ?? 'Participant'}
          avatar={ps?.avatar}
          videoOn={ps ? ps.video : stream.getVideoTracks().length > 0}
          audioOn={ps ? ps.audio : true}
          connectionState={peerConnectionStates[peerId]}
          handRaised={ps?.handRaised ?? false}
          activeReaction={activeReactions[peerId]}
          activeSpeaker={activeSpeaker === peerId}
          objectFit="cover"
          showVolumeControl
          peerVolume={peerVolumes[peerId] ?? 1}
          onPeerVolumeChange={(v) => handlePeerVolumeChange(peerId, ps?.name ?? 'Participant', v)}
        />
        {localStream && (
          <Box
            sx={{
              position: 'absolute',
              bottom: { xs: 88, sm: 104 },
              right: { xs: 12, sm: 20 },
              width: { xs: 116, sm: 200 },
              aspectRatio: '16/9',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 2,
            }}
          >
            <VideoTile
              stream={localStream}
              audioStream={localStream}
              muted
              name={`${user?.name ?? 'You'} (You)`}
              avatar={user?.avatar}
              videoOn={localVideoOn}
              audioOn={localAudioOn}
              handRaised={handRaised}
              activeReaction={activeReactions[socket.id]}
              activeSpeaker={activeSpeaker === socket.id}
              mirror
            />
          </Box>
        )}
      </Box>
    );
  }

  function renderGridLayout() {
    const allTiles = cameraTiles();
    // Pagination — cap visible tiles per page so a big call doesn't shrink to
    // postage stamps; page through the rest (Meet-style). Grid still fits without
    // scrolling at any page size.
    const PAGE_SIZE = isMobile ? 6 : 9;
    const pageCount = Math.ceil(allTiles.length / PAGE_SIZE) || 1;
    const page = Math.min(gridPage, pageCount - 1);
    const tiles = pageCount > 1 ? allTiles.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : allTiles;
    const count = tiles.length;
    // Cap column count so a few people don't get tiny tiles.
    const maxCols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
    return (
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          px: { xs: 1.5, sm: 3 },
          pt: 9,
          pb: { xs: 12, sm: 13 },
        }}
      >
        {/* Pagination arrows + indicator (only when there's more than one page) */}
        {pageCount > 1 && (
          <>
            <IconButton
              onClick={() => setGridPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              sx={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 4,
                bgcolor: 'control.surface', backdropFilter: 'blur(12px)', color: 'text.primary',
                '&:hover': { bgcolor: 'control.idleHover' }, '&.Mui-disabled': { opacity: 0.3 },
              }}
            >
              <NavigateBeforeIcon />
            </IconButton>
            <IconButton
              onClick={() => setGridPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              sx={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 4,
                bgcolor: 'control.surface', backdropFilter: 'blur(12px)', color: 'text.primary',
                '&:hover': { bgcolor: 'control.idleHover' }, '&.Mui-disabled': { opacity: 0.3 },
              }}
            >
              <NavigateNextIcon />
            </IconButton>
            <Box
              sx={{
                position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 4,
                px: 1.5, py: 0.25, borderRadius: 999, fontSize: 12, fontWeight: 600,
                bgcolor: 'control.surface', backdropFilter: 'blur(12px)', color: 'text.secondary',
              }}
            >
              {page + 1} / {pageCount}
            </Box>
          </>
        )}
        {/* minHeight:100% centers when content fits, but lets it scroll (no clipping) when it overflows */}
        <Box sx={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {remoteEntries.length === 0 && !isScreenSharing ? (
            <Box sx={{ textAlign: 'center', maxWidth: 420, animation: 'ameet-fade-in 0.4s ease-out' }}>
              <Box
                sx={{
                  width: 72, height: 72, mx: 'auto', mb: 2, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: (t) => t.palette.brand.gradient, color: '#202124',
                }}
              >
                <PeopleAltIcon sx={{ fontSize: 34 }} />
              </Box>
              <Typography variant="h6" sx={{ fontFamily: '"Outfit", sans-serif', fontWeight: 600 }}>
                You're the only one here
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
                Share the joining link to invite others to the call.
              </Typography>
              <Chip
                icon={<ContentCopyIcon sx={{ fontSize: 16 }} />}
                label={`Copy link · ${roomId}`}
                onClick={handleCopyLink}
                sx={{ bgcolor: 'rgba(255,255,255,0.06)', py: 2, px: 0.5, fontWeight: 500, '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}
              />
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gap: { xs: 1, sm: 1.5 },
                width: '100%',
                maxWidth: 1320,
                gridTemplateColumns: {
                  xs: count <= 1 ? '1fr' : 'repeat(2, 1fr)',
                  sm: `repeat(${maxCols}, 1fr)`,
                },
              }}
            >
              {tiles.map(({ key, audioStream: tileAudioStream, ...t }) => (
                <Box key={key} sx={{ aspectRatio: '16/9', borderRadius: '16px', overflow: 'hidden' }}>
                  <VideoTile {...t} audioStream={tileAudioStream} />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // Focused layout (pin / spotlight / sidebar): one big tile + the rest in a rail
  // (right column on desktop, top strip on mobile — same shape as presentation).
  function renderFocusLayout(key, { showRail = true } = {}) {
    const tiles = cameraTiles();
    const isFocus = (t) => t.key === key || (t.key === 'local' && key === socket.id);
    const focus = tiles.find(isFocus);
    if (!focus) return renderGridLayout();
    const rest = tiles.filter((t) => !isFocus(t));
    // Strip `key` so it isn't forwarded as a prop to the single focus tile.
    const focusProps = { ...focus };
    delete focusProps.key;
    return (
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ flex: 1, p: { xs: 1, sm: 1.5 }, minWidth: 0, minHeight: 0, pt: { xs: 8, sm: 9 }, pb: { sm: 13 } }}>
          <Box sx={{ width: '100%', height: '100%', borderRadius: 3, overflow: 'hidden' }}>
            <VideoTile {...focusProps} objectFit="cover" />
          </Box>
        </Box>
        {showRail && rest.length > 0 && (
          <Box
            sx={{
              display: 'flex', gap: 1, p: 1, flexShrink: 0,
              order: { xs: -1, sm: 0 },
              width: { xs: '100%', sm: 184 },
              height: { xs: 92, sm: 'auto' },
              flexDirection: { xs: 'row', sm: 'column' },
              overflowX: { xs: 'auto', sm: 'visible' },
              overflowY: { xs: 'visible', sm: 'auto' },
              pt: { xs: 0, sm: 7 }, pb: { sm: 13 },
            }}
          >
            {rest.map(({ key: rk, audioStream: rAudio, ...t }) => (
              <Box
                key={rk}
                sx={{
                  flexShrink: 0,
                  width: { xs: 140, sm: '100%' },
                  height: { xs: '100%', sm: 'auto' },
                  aspectRatio: { sm: '16/9' },
                  borderRadius: '16px', overflow: 'hidden',
                }}
              >
                <VideoTile {...t} audioStream={rAudio} />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // --- People / focus / moderation (M12) ---
  const people = [
    {
      id: socket.id, name: user?.name ?? 'You', avatar: user?.avatar,
      audioOn: localAudioOn, videoOn: localVideoOn, handRaised,
      isSpeaking: activeSpeaker === socket.id, isLocal: true, isHost, pinned: pinnedKey === socket.id,
    },
    ...remoteEntries.map(([sid, stream]) => {
      const ps = peerStates[sid];
      return {
        id: sid, name: ps?.name ?? 'Participant', avatar: ps?.avatar,
        audioOn: ps ? ps.audio : true,
        videoOn: ps ? ps.video : stream.getVideoTracks().length > 0,
        handRaised: ps?.handRaised ?? false,
        isSpeaking: activeSpeaker === sid, isLocal: false, isHost: false, pinned: pinnedKey === sid,
      };
    }),
  ];

  const handlePin = (person) => setPinnedKey((k) => (k === person.id ? null : person.id));
  const handleSpotlight = (person) =>
    socket.emit('sfu-spotlight', { socketId: spotlightKey === person.id ? null : person.id });
  const handleHostMute = (person) => socket.emit('sfu-host-mute', { socketId: person.id });
  const handleAskUnmute = (person) => socket.emit('sfu-request-unmute', { socketId: person.id });
  const handleMuteAll = () => {
    socket.emit('sfu-mute-all');
    pushNote({ kind: 'event', variant: 'info', text: 'Muted everyone' });
  };
  const handleAskUnmuteAll = () => {
    socket.emit('sfu-request-unmute-all');
    pushNote({ kind: 'event', variant: 'info', text: 'Asked everyone to unmute' });
  };
  const handleHostRemove = (person) => socket.emit('sfu-host-remove', { socketId: person.id });

  // A focus key is only valid if that person is still present.
  const keyPresent = (k) => k && (k === socket.id || Boolean(remoteStreams[k]));
  const explicitFocus = keyPresent(spotlightKey) ? spotlightKey : keyPresent(pinnedKey) ? pinnedKey : null;
  // Layout chooser forcing spotlight/sidebar with no explicit pick → follow the
  // active speaker, else the first remote, else self.
  const fallbackFocus = keyPresent(activeSpeaker)
    ? activeSpeaker
    : (remoteEntries[0]?.[0] ?? socket.id);
  const wantsFocus = explicitFocus || layoutMode === 'spotlight' || layoutMode === 'sidebar';
  const displayFocus = explicitFocus ?? fallbackFocus;

  // Decide the active stage layout (screen share always wins).
  let stage;
  if (hasScreen) stage = renderPresentationLayout();
  else if (wantsFocus) stage = renderFocusLayout(displayFocus, { showRail: layoutMode !== 'spotlight' });
  else if (layoutMode === 'tiled') stage = renderGridLayout();
  else if (isAlone) stage = renderAloneLayout();
  else if (isSoloCall) stage = renderSoloLayout();
  else stage = renderGridLayout();

  return (
    <Box
      sx={{
        height: '100vh',
        '@supports (height: 100dvh)': { height: '100dvh' },
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      {/* Remote audio: dedicated hidden <audio> per peer, mounted once outside
          the tile layout so audio survives layout switches and late tracks. */}
      <RemoteAudio streams={remoteStreams} masterVolume={outputVolume} peerVolumes={peerVolumes} />

      {/* Dev-only WebRTC stats overlay (no-op in production builds). */}
      <RtcStatsOverlay stats={rtcStats} />

      {/* Floating status banners */}
      {(!socketConnected || permissionDenied) && (
        <Box sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1400, width: 'min(92%, 520px)' }}>
          {!socketConnected && (
            <Alert severity="warning" variant="filled" sx={{ borderRadius: 2, mb: 1 }}>
              Connection lost — reconnecting…
            </Alert>
          )}
          {permissionDenied && (
            <Alert severity="error" variant="filled" sx={{ borderRadius: 2 }}>
              Camera and microphone access denied. Check your browser permissions and reload.
            </Alert>
          )}
        </Box>
      )}

      {/* Stage + chat */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Stage (full-bleed) */}
        <Box
          sx={{ flex: 1, position: 'relative', minWidth: 0 }}
          onMouseMove={handleStageMouseMove}
        >
          {stage}

          {/* Bottom-left floating emoji stream (M7.5) */}
          <ReactionsOverlay reactions={floatingReactions} />

          <LiveCaptions
            entry={transcriptState.active ? latestCaption : null}
            interim={transcriptState.active ? latestInterim : null}
          />

          {/* Top overlay: meeting info (left) + participants (right) */}
          <Box
            sx={{
              position: 'absolute', top: 0, left: 0, right: 0,
              p: { xs: 1.5, sm: 2 },
              display: 'flex', alignItems: 'center', gap: 1,
              pointerEvents: 'none',
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                pointerEvents: 'auto',
                bgcolor: 'control.surface',
                backdropFilter: 'blur(12px)',
                borderRadius: 999,
                pl: 1.5, pr: 0.5, py: 0.5,
                maxWidth: '70%',
              }}
            >
              <LiveClock variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }} />
              {meetingTitle && (
                <>
                  <Box sx={{ width: '1px', height: 16, bgcolor: 'divider', flexShrink: 0 }} />
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: { xs: 100, sm: 200 } }}>
                    {meetingTitle}
                  </Typography>
                </>
              )}
              <Box sx={{ width: '1px', height: 16, bgcolor: 'divider', flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
              <Typography variant="body2" color="text.secondary" noWrap sx={{ fontFamily: 'monospace', display: { xs: 'none', sm: 'block' } }}>
                {roomId}
              </Typography>
              <Tooltip title="Copy joining link">
                <IconButton size="small" onClick={handleCopyLink} sx={{ color: 'text.secondary' }}>
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              {isScreenSharing && !isMobile && (
                <Chip
                  icon={<StopScreenShareIcon sx={{ fontSize: 14 }} />}
                  label="Stop presenting"
                  size="small"
                  onClick={handleToggleShare}
                  sx={{
                    height: 26, cursor: 'pointer',
                    bgcolor: 'error.main', color: '#fff', fontWeight: 600,
                    '& .MuiChip-icon': { color: 'rgba(255,255,255,0.85)' },
                    '&:hover': { bgcolor: 'error.dark' },
                  }}
                />
              )}
              {transcriptState.active && (
                <Chip
                  label={isMobile ? 'Live' : 'Transcript live'}
                  size="small"
                  onClick={() => setActivePanel('transcript')}
                  sx={{
                    height: 26,
                    cursor: 'pointer',
                    color: '#fff',
                    bgcolor: 'rgba(239,68,68,0.88)',
                    '&::before': {
                      content: '""', width: 7, height: 7, borderRadius: '50%',
                      bgcolor: '#fff', ml: 1, mr: -0.25, animation: 'blink 1.6s ease-in-out infinite',
                    },
                    '&:hover': { bgcolor: 'error.main' },
                  }}
                />
              )}
            </Stack>

            <Box sx={{ flex: 1 }} />

            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                pointerEvents: 'auto',
                bgcolor: 'control.surface',
                backdropFilter: 'blur(12px)',
                borderRadius: 999,
                px: 1, py: 0.5,
              }}
            >
              {!isMobile && users.length > 0 && (
                <AvatarGroup data-testid="participant-roster" max={4} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 12, borderColor: 'background.default' } }}>
                  {users.map((u) => (
                    <Avatar key={u.id} src={u.avatar} alt={u.name}>{u.name?.[0]}</Avatar>
                  ))}
                </AvatarGroup>
              )}
              <PeopleAltIcon sx={{ fontSize: 18, color: 'text.secondary', ml: isMobile ? 0 : 0.5 }} />
              <Typography variant="body2" sx={{ fontWeight: 600, pr: 0.5 }}>
                {users.length || 1}
              </Typography>
            </Stack>
          </Box>

          {/* Floating control bar — auto-hides during screen share */}
          <Box
            sx={{
              position: 'absolute',
              bottom: { xs: 12, sm: 20 },
              left: '50%',
              transform: controlsShown ? 'translateX(-50%)' : 'translateX(-50%) translateY(12px)',
              zIndex: 3,
              opacity: controlsShown ? 1 : 0,
              pointerEvents: controlsShown ? 'auto' : 'none',
              transition: 'opacity 0.25s ease, transform 0.25s ease',
              maxWidth: 'calc(100vw - 16px)',
              px: { xs: 0.5, sm: 0 },
            }}
          >
            <ControlBar
              localAudioOn={localAudioOn} hasMic={hasMic} onToggleAudio={handleToggleAudio}
              localVideoOn={localVideoOn} onToggleVideo={handleToggleVideo}
              isScreenSharing={isScreenSharing} onToggleShare={handleToggleShare}
              handRaised={handRaised} onToggleHand={handleToggleHand}
              onReact={(el) => setReactionAnchor(el)}
              showChat={showChat} unreadCount={unreadCount} onToggleChat={handleToggleChat}
              transcriptActive={transcriptState.active}
              transcriptAvailable={transcriptState.active || transcriptEntries.length > 0}
              showTranscript={showTranscript}
              transcriptDisabled={!transcriptState.active && transcriptEntries.length === 0 && !isHost}
              onToggleTranscript={handleToggleTranscript}
              showPeople={showPeople} peopleCount={people.length} onTogglePeople={handleTogglePeople}
              layoutMode={layoutMode} onLayoutChange={setLayoutMode}
              soundEnabled={soundEnabled} onToggleSound={handleToggleSound}
              pipSupported={pipSupported} pipActive={pipActive} onTogglePip={handleTogglePip}
              onCopyLink={handleCopyLink}
              onScreenshot={handleScreenshot}
              onLeave={handleLeave}
              micGain={micGain} onMicGainChange={setMicGain}
              outputVolume={outputVolume} onOutputVolumeChange={setOutputVolume}
              showPinToggle={hasScreen} pinned={controlsPinned} onTogglePin={() => setControlsPinned((v) => !v)}
            />
          </Box>

          {/* Join/leave flashes + chat-message previews (bottom-left) */}
          <CallNotifications
            notes={notes}
            onOpenChat={openChat}
            onDismiss={dismissNote}
          />
        </Box>

        {/* Right rail — single panel: Chat / People / Transcript (Meet-style) */}
        {showChat && (
          <ChatPanel
            messages={messages}
            input={input}
            setInput={setInput}
            onSend={sendMessage}
            currentUserId={user?.id}
            onClose={() => setActivePanel(null)}
          />
        )}
        {showPeople && (
          <PeoplePanel
            people={people}
            currentUserIsHost={isHost}
            onClose={() => setActivePanel(null)}
            onPin={handlePin}
            onSpotlight={handleSpotlight}
            onMute={handleHostMute}
            onAskUnmute={handleAskUnmute}
            onRemove={handleHostRemove}
            onMuteAll={handleMuteAll}
            onAskUnmuteAll={handleAskUnmuteAll}
          />
        )}
        <TranscriptPanel
          open={showTranscript}
          entries={transcriptEntries}
          active={transcriptState.active}
          interims={transcriptInterimList}
          contributorStatus={shouldContributeTranscript ? contributorState.status : (localAudioOn ? 'idle' : 'paused')}
          contributorError={contributorState.error || pcmCapture.error}
          isHost={isHost}
          canContribute={transcriptConsent && pcmCapture.supported && !!transcriptConfigured}
          onEnableContribution={() => setTranscriptConsentOpen(true)}
          onStop={stopSharedTranscript}
          onDownload={handleDownloadTranscript}
          onClose={() => setActivePanel(null)}
        />
      </Box>

      {/* Meeting-ended snackbar */}
      <Snackbar open={meetingEndedSnack} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="info" variant="filled" sx={{ width: '100%' }}>
          The meeting has been ended by the meeting admin.
        </Alert>
      </Snackbar>

      {/* Host asked you to unmute — one-tap prompt, never forced (M12) */}
      <Snackbar
        open={Boolean(unmuteRequestFrom)}
        onClose={() => setUnmuteRequestFrom(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 90, sm: 110 } }}
      >
        <Alert
          severity="info"
          variant="filled"
          sx={{ width: '100%', alignItems: 'center' }}
          action={
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                if (!localAudioOn && hasMic) { playSound('toggleOn'); toggleAudio(); }
                setUnmuteRequestFrom(null);
              }}
              sx={{ fontWeight: 700 }}
            >
              Unmute
            </Button>
          }
        >
          {unmuteRequestFrom} asked you to unmute
        </Alert>
      </Snackbar>

      {/* Host leave confirmation — non-hosts leave immediately (no dialog) */}
      <Dialog
        open={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        slotProps={{ paper: { sx: { borderRadius: 3, minWidth: 320 } } }}
      >
        <DialogTitle sx={{ pb: 1 }}>Leave this meeting?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You're the meeting admin. You can leave quietly and let others continue, or end the meeting for everyone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => { setLeaveDialogOpen(false); doLeave(false); }}>Leave call</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => { setLeaveDialogOpen(false); doLeave(true); }}
          >
            End for everyone
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={transcriptConsentOpen}
        onClose={declineTranscriptConsent}
        slotProps={{ paper: { sx: { borderRadius: 3, maxWidth: 500 } } }}
      >
        <DialogTitle sx={{ pb: 1 }}>Contribute to the shared transcript?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              A Meet will stream only your microphone in English to the meeting server. Every participant's results are merged into one shared, speaker-labelled transcript.
            </Typography>
            <Alert severity="info" variant="outlined">
              Audio is sent to Deepgram Nova-3 for live captions. Completed speech turns may also be sent to Groq Whisper for accuracy and jargon correction. A Meet does not save the audio.
            </Alert>
            <Typography variant="caption" color="text.disabled">
              This choice is remembered on this browser. You can mute your microphone to pause your contribution.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={declineTranscriptConsent}>Not now</Button>
          <Button variant="contained" onClick={acceptTranscriptConsent}>Allow transcription</Button>
        </DialogActions>
      </Dialog>

      {/* Emoji reaction picker */}
      <Popover
        open={Boolean(reactionAnchor)}
        anchorEl={reactionAnchor}
        onClose={() => setReactionAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { mb: 1.5, p: 0.5, borderRadius: 999 } } }}
      >
        <Stack direction="row" spacing={0.25}>
          {REACTION_EMOJIS.map((emoji) => (
            <IconButton
              key={emoji}
              onClick={() => { sendReaction(emoji); setReactionAnchor(null); }}
              sx={{
                fontSize: 26, width: 48, height: 48,
                transition: 'transform 0.12s ease',
                '&:hover': { transform: 'scale(1.25)', bgcolor: 'transparent' },
              }}
            >
              {emoji}
            </IconButton>
          ))}
        </Stack>
      </Popover>
    </Box>
  );
}

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Alert, Avatar, AvatarGroup, Box, Button, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Popover,
  Snackbar, Stack, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import {
  ContentCopy as ContentCopyIcon,
  PeopleAlt as PeopleAltIcon,
  StopScreenShare as StopScreenShareIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { RoomMetaContext } from '../components/RoomGuard';
import socket from '../services/socket';
import { useMediasoup } from '../hooks/useMediasoup';
import { usePictureInPicture } from '../hooks/usePictureInPicture';
import VideoTile from '../components/VideoTile';
import RemoteAudio from '../components/RemoteAudio';
import RtcStatsOverlay from '../components/RtcStatsOverlay';
import ControlBar from '../components/ControlBar';
import ChatPanel from '../components/ChatPanel';
import CallNotifications from '../components/CallNotifications';
import ReactionsOverlay from '../components/ReactionsOverlay';
import { playSound, isSoundEnabled, toggleSound } from '../services/sounds';
import { copyMeetingScreenshot, downloadMeetingScreenshot } from '../utils/capture-screenshot';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🎉'];

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
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeReactions, setActiveReactions] = useState({});
  const [floatingReactions, setFloatingReactions] = useState([]);
  const floatIdRef = useRef(0);
  const [reactionAnchor, setReactionAnchor] = useState(null);
  const [outputVolume, setOutputVolume] = useState(1);
  const [controlsPinned, setControlsPinned] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef(null);
  const [meetingEndedSnack, setMeetingEndedSnack] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => isSoundEnabled());
  const [isHost, setIsHost] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [showScreenAnyway, setShowScreenAnyway] = useState(false);
  // Bottom-left transient flashes: join/leave, chat previews, copy confirmation.
  const [notes, setNotes] = useState([]);
  const reactionTimers = useRef({});
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

  // Determine whether the current user created (and therefore hosts) this room
  // so we can offer "End for everyone" vs "Leave call" on the leave button.
  useEffect(() => {
    fetch(`/api/rooms/${roomId}`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.host && user?.id && data.host._id === user.id) setIsHost(true);
      })
      .catch(() => {});
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

  // Keep peerStatesRef in sync so the mount-only socket effect can read fresh state
  useEffect(() => { peerStatesRef.current = peerStates; }, [peerStates]);

  const remoteEntries = Object.entries(remoteStreams);
  const remoteScreenEntries = Object.entries(remoteScreens);
  const isSoloCall = remoteEntries.length === 1 && remoteScreenEntries.length === 0 && !isScreenSharing;
  const isAlone = remoteEntries.length === 0 && !isScreenSharing;
  const hasScreen = isScreenSharing || remoteScreenEntries.length > 0;

  // Reset "show anyway" whenever a new screen share starts/stops.
  useEffect(() => {
    if (!isScreenSharing) setShowScreenAnyway(false);
  }, [isScreenSharing]);

  // Unified shares model — avoids self-mirror loop and supports multi-share
  const shares = [
    ...remoteScreenEntries.map(([sid, stream]) => ({
      key: sid, stream, isLocal: false,
      name: peerStates[sid]?.name ?? 'Participant', surface: null,
    })),
    ...(isScreenSharing && localScreenStream
      ? [{ key: 'local', stream: localScreenStream, isLocal: true,
           name: user?.name ?? 'You', surface: localScreenSurface }]
      : []),
  ];
  const [pinnedShareKey, setPinnedShareKey] = useState(null);
  const pinnedShare = shares.find((s) => s.key === pinnedShareKey)
    ?? shares.find((s) => !s.isLocal)
    ?? shares[0]
    ?? null;

  // Keep pinnedShareKey valid when shares list changes
  useEffect(() => {
    if (pinnedShareKey && !shares.find((s) => s.key === pinnedShareKey)) {
      setPinnedShareKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shares.map((s) => s.key).join(',')]);

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
    socket.connect();
    socket.emit('join-room', roomId);

    socket.on('room-users', (list) => setUsers(list));
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
    socket.on('sfu-meeting-ended', () => {
      setMeetingEndedSnack(true);
      setTimeout(() => navigate('/'), 2500);
    });
    socket.on('sfu-reaction', ({ emoji, socketId }) => {
      setActiveReactions((prev) => ({ ...prev, [socketId]: emoji }));
      playSound('reaction');
      clearTimeout(reactionTimers.current[socketId]);
      reactionTimers.current[socketId] = setTimeout(() => {
        setActiveReactions((prev) => {
          const next = { ...prev }; delete next[socketId]; return next;
        });
      }, 3000);
      // Bottom-left floating stream — read fresh metadata via refs
      const isSelf = socketId === socket.id;
      const meta = isSelf
        ? { name: userRef.current?.name, avatar: userRef.current?.avatar }
        : { name: peerStatesRef.current[socketId]?.name, avatar: peerStatesRef.current[socketId]?.avatar };
      const fid = (floatIdRef.current += 1);
      setFloatingReactions((p) => [...p, { id: fid, emoji, ...meta }]);
      setTimeout(() => setFloatingReactions((p) => p.filter((r) => r.id !== fid)), 1800);
    });
    // Separate listener purely for the raise-hand cue (peers only; server
    // excludes the sender, so this never fires for our own toggle). Removed by
    // reference so we don't also detach useMediasoup's own listener.
    const onPeerHandRaise = ({ raised }) => { if (raised) playSound('raiseHand'); };
    socket.on('sfu-hand-raise-update', onPeerHandRaise);

    return () => {
      socket.off('room-users');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('chat-message');
      socket.off('sfu-meeting-ended');
      socket.off('sfu-reaction');
      socket.off('sfu-hand-raise-update', onPeerHandRaise);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const handleToggleChat = () => {
    const next = !showChat;
    setShowChat(next);
    if (next) setUnreadCount(0); // clear unread when opening
  };

  function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    socket.emit('chat-message', { roomId, text });
    setInput('');
  }

  function sendReaction(emoji) {
    socket.emit('sfu-reaction', { emoji }); // echoes back via io.in → shows + sound
    setReactionAnchor(null);
  }

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
    return [
      localStream && {
        key: 'local',
        stream: localStream,
        audioStream: localStream,
        muted: true,
        name: `${user?.name ?? 'You'} (You)`,
        avatar: user?.avatar,
        videoOn: localVideoOn,
        audioOn: localAudioOn,
        handRaised: false,
        activeReaction: activeReactions[socket.id],
        activeSpeaker: activeSpeaker === socket.id,
        mirror: true,
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
        };
      }),
    ].filter(Boolean);
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
    const tiles = cameraTiles();
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
      <RemoteAudio streams={remoteStreams} volume={outputVolume} />

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
          {hasScreen ? renderPresentationLayout() : isAlone ? renderAloneLayout() : isSoloCall ? renderSoloLayout() : renderGridLayout()}

          {/* Bottom-left floating emoji stream (M7.5) */}
          <ReactionsOverlay reactions={floatingReactions} />

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
                <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 12, borderColor: 'background.default' } }}>
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
            onOpenChat={() => { setShowChat(true); setUnreadCount(0); }}
            onDismiss={dismissNote}
          />
        </Box>

        {/* Chat */}
        {showChat && (
          <ChatPanel
            messages={messages}
            input={input}
            setInput={setInput}
            onSend={sendMessage}
            currentUserId={user?.id}
            onClose={() => setShowChat(false)}
          />
        )}
      </Box>

      {/* Meeting-ended snackbar */}
      <Snackbar open={meetingEndedSnack} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="info" variant="filled" sx={{ width: '100%' }}>
          The meeting has been ended by the host.
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
            You're the host. You can leave quietly and let others continue, or end the meeting for everyone.
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
              onClick={() => sendReaction(emoji)}
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

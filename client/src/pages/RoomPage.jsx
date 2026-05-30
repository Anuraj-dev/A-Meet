import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Alert, Avatar, AvatarGroup, Box, Chip, IconButton, Popover,
  Snackbar, Stack, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import {
  ContentCopy as ContentCopyIcon,
  PeopleAlt as PeopleAltIcon,
  PresentToAll as PresentIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import socket from '../services/socket';
import { useMediasoup } from '../hooks/useMediasoup';
import VideoTile from '../components/VideoTile';
import ControlBar from '../components/ControlBar';
import ChatPanel from '../components/ChatPanel';
import { playSound, isSoundEnabled, toggleSound } from '../services/sounds';

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

  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeReactions, setActiveReactions] = useState({});
  const [reactionAnchor, setReactionAnchor] = useState(null);
  const [meetingEndedSnack, setMeetingEndedSnack] = useState(false);
  const [toast, setToast] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => isSoundEnabled());
  const reactionTimers = useRef({});
  // Live ref so the mount-only socket effect always compares against the
  // current user id (auth may resolve after this component mounts).
  const userIdRef = useRef(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

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
    isScreenSharing, localScreenStream, shareScreen, stopScreenShare,
    handRaised, toggleHand,
    activeSpeaker, socketConnected, permissionDenied,
  } = useMediasoup(roomId, devices);

  const remoteEntries = Object.entries(remoteStreams);
  const remoteScreenEntries = Object.entries(remoteScreens);
  const isSoloCall = remoteEntries.length === 1 && remoteScreenEntries.length === 0 && !isScreenSharing;
  const hasScreen = isScreenSharing || remoteScreenEntries.length > 0;

  const pinnedScreenSid = remoteScreenEntries[0]?.[0] ?? null;
  const pinnedScreenStream = pinnedScreenSid ? remoteScreens[pinnedScreenSid] : localScreenStream;
  const pinnedScreenName = pinnedScreenSid
    ? (peerStates[pinnedScreenSid]?.name ?? 'Participant')
    : `${user?.name ?? 'You'}`;

  useEffect(() => {
    socket.connect();
    socket.emit('join-room', roomId);

    socket.on('room-users', (list) => setUsers(list));
    socket.on('user-joined', (u) => {
      setUsers((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]));
      setMessages((prev) => [...prev, { type: 'event', text: `${u.name} joined`, ts: Date.now() }]);
      playSound('join');
    });
    socket.on('user-left', (u) => {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setMessages((prev) => [...prev, { type: 'event', text: `${u.name} left`, ts: Date.now() }]);
      playSound('leave');
    });
    socket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev, { type: 'chat', ...msg }]);
      setUnreadCount((n) => n + 1);
      if (msg.sender?.id !== userIdRef.current) playSound('message');
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
  const handleLeave = () => {
    playSound('callEnd');
    socket.emit('sfu-end-meeting');
    navigate('/');
  };
  const handleToggleSound = () => setSoundEnabled(toggleSound());
  async function handleCopyLink() {
    const link = `${window.location.origin}/lobby/${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
      setToast('Joining link copied to clipboard');
    } catch {
      setToast(link);
    }
  }

  // --- Camera tiles (shared by presentation rail) ---
  function cameraTiles() {
    return [
      localStream && {
        key: 'local',
        stream: localStream,
        muted: true,
        name: `${user?.name ?? 'You'} (You)`,
        avatar: user?.avatar,
        videoOn: localVideoOn,
        audioOn: localAudioOn,
        handRaised: false,
        activeReaction: activeReactions[socket.id],
        mirror: true,
      },
      ...remoteEntries.map(([peerId, stream]) => {
        const ps = peerStates[peerId];
        return {
          key: peerId,
          stream,
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

  function renderPresentationLayout() {
    const tiles = cameraTiles();
    return (
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
        {/* Pinned screen */}
        <Box sx={{ flex: 1, position: 'relative', p: { xs: 1, sm: 1.5 }, minHeight: 0, minWidth: 0 }}>
          {pinnedScreenStream ? (
            <Box sx={{ width: '100%', height: '100%', borderRadius: 3, overflow: 'hidden', bgcolor: '#000' }}>
              <VideoTile
                stream={pinnedScreenStream}
                muted={!pinnedScreenSid}
                name={isScreenSharing && !pinnedScreenSid ? 'Your screen' : `${pinnedScreenName}'s screen`}
                videoOn
                audioOn
                objectFit="contain"
              />
            </Box>
          ) : (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.disabled">No screen to display</Typography>
            </Box>
          )}
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
            pb: { sm: 13 }, // clear the floating control bar on desktop
          }}
        >
          {tiles.map(({ key, ...t }) => (
            <Box
              key={key}
              sx={{
                flexShrink: 0,
                width: { xs: 140, sm: '100%' },
                height: { xs: '100%', sm: 'auto' },
                aspectRatio: { sm: '16/9' },
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <VideoTile {...t} />
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
              borderRadius: 3,
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 2,
            }}
          >
            <VideoTile
              stream={localStream}
              muted
              name={`${user?.name ?? 'You'} (You)`}
              avatar={user?.avatar}
              videoOn={localVideoOn}
              audioOn={localAudioOn}
              activeReaction={activeReactions[socket.id]}
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
              {tiles.map(({ key, ...t }) => (
                <Box key={key} sx={{ aspectRatio: '16/9', borderRadius: 3, overflow: 'hidden' }}>
                  <VideoTile {...t} />
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
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {hasScreen ? renderPresentationLayout() : isSoloCall ? renderSoloLayout() : renderGridLayout()}

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
              <Box sx={{ width: '1px', height: 16, bgcolor: 'divider' }} />
              <Typography variant="body2" color="text.secondary" noWrap sx={{ fontFamily: 'monospace' }}>
                {roomId}
              </Typography>
              <Tooltip title="Copy joining link">
                <IconButton size="small" onClick={handleCopyLink} sx={{ color: 'text.secondary' }}>
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              {isScreenSharing && !isMobile && (
                <Chip
                  icon={<PresentIcon sx={{ fontSize: 16 }} />}
                  label="Presenting"
                  size="small"
                  color="primary"
                  sx={{ height: 26 }}
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

          {/* Floating control bar */}
          <Box
            sx={{
              position: 'absolute',
              bottom: { xs: 12, sm: 20 },
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 3,
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
              onCopyLink={handleCopyLink}
              onLeave={handleLeave}
            />
          </Box>
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

      {/* Copy / info toast */}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2600}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        sx={{ '& .MuiSnackbarContent-root': { borderRadius: 2 } }}
      />

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

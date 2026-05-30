import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Avatar, Badge, Box, Chip, Divider, IconButton, InputAdornment,
  Popover, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  CallEnd as CallEndIcon,
  Chat as ChatIcon,
  EmojiEmotions as EmojiEmotionsIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  PanTool as PanToolIcon,
  ScreenShare as ScreenShareIcon,
  Send as SendIcon,
  StopScreenShare as StopScreenShareIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import socket from '../services/socket';
import { useMediasoup } from '../hooks/useMediasoup';
import VideoTile from '../components/VideoTile';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🎉'];

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { state: locationState } = useLocation();
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeReactions, setActiveReactions] = useState({}); // socketId → emoji
  const [reactionAnchor, setReactionAnchor] = useState(null);
  const bottomRef = useRef(null);
  const reactionTimers = useRef({});

  const devices = {
    videoDeviceId: locationState?.videoDeviceId ?? null,
    audioDeviceId: locationState?.audioDeviceId ?? null,
    startVideoOn: locationState?.startVideoOn ?? true,
    startAudioOn: locationState?.startAudioOn ?? true,
  };

  const {
    localStream, remoteStreams, remoteScreens, peerStates, peerConnectionStates,
    localVideoOn, localAudioOn, hasCamera, hasMic,
    toggleVideo, toggleAudio,
    isScreenSharing, localScreenStream, shareScreen, stopScreenShare,
    handRaised, toggleHand,
    activeSpeaker,
  } = useMediasoup(roomId, devices);

  const remoteEntries = Object.entries(remoteStreams);
  const remoteScreenEntries = Object.entries(remoteScreens);
  const isSoloCall = remoteEntries.length === 1 && remoteScreenEntries.length === 0 && !isScreenSharing;
  const hasScreen = isScreenSharing || remoteScreenEntries.length > 0;

  // Determine which screen to pin: prefer a remote one; fall back to local
  const pinnedScreenSid = remoteScreenEntries[0]?.[0] ?? null;
  const pinnedScreenStream = pinnedScreenSid ? remoteScreens[pinnedScreenSid] : localScreenStream;
  const pinnedScreenName = pinnedScreenSid
    ? (peerStates[pinnedScreenSid]?.name ?? 'Participant')
    : `${user?.name ?? 'You'} (You)`;

  useEffect(() => {
    socket.connect();
    socket.emit('join-room', roomId);

    socket.on('room-users', (list) => setUsers(list));
    socket.on('user-joined', (u) => {
      setUsers((prev) => {
        if (prev.some((x) => x.id === u.id)) return prev;
        return [...prev, u];
      });
      setMessages((prev) => [...prev, { type: 'event', text: `${u.name} joined`, ts: Date.now() }]);
    });
    socket.on('user-left', (u) => {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setMessages((prev) => [...prev, { type: 'event', text: `${u.name} left`, ts: Date.now() }]);
    });
    socket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev, { type: 'chat', ...msg }]);
      setUnreadCount((n) => n + 1);
    });
    socket.on('sfu-reaction', ({ emoji, socketId }) => {
      setActiveReactions((prev) => ({ ...prev, [socketId]: emoji }));
      clearTimeout(reactionTimers.current[socketId]);
      reactionTimers.current[socketId] = setTimeout(() => {
        setActiveReactions((prev) => {
          const next = { ...prev }; delete next[socketId]; return next;
        });
      }, 3000);
    });

    return () => {
      socket.off('room-users');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('chat-message');
      socket.off('sfu-reaction');
      socket.disconnect();
    };
  }, [roomId]);

  // Reset unread count when chat panel is opened
  useEffect(() => {
    if (showChat) setUnreadCount(0);
  }, [showChat]);

  useEffect(() => {
    if (showChat) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showChat]);

  function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    socket.emit('chat-message', { roomId, text });
    setInput('');
  }

  function sendReaction(emoji) {
    socket.emit('sfu-reaction', { emoji });
    setReactionAnchor(null);
  }

  // --- Layouts ---

  // Presentation layout: pinned screen + right-rail camera thumbnails
  function renderPresentationLayout() {
    const allCameraTiles = [
      localStream && {
        key: 'local',
        stream: localStream,
        muted: true,
        name: `${user?.name ?? 'You'} (You)`,
        avatar: user?.avatar,
        videoOn: localVideoOn,
        audioOn: localAudioOn,
        handRaised: false,
        reaction: activeReactions[socket.id],
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
          reaction: activeReactions[peerId],
          isSpeaker: activeSpeaker === peerId,
        };
      }),
    ].filter(Boolean);

    return (
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Main screen tile */}
        <Box sx={{ flex: 1, position: 'relative', p: 1 }}>
          {pinnedScreenStream ? (
            <VideoTile
              stream={pinnedScreenStream}
              muted={!pinnedScreenSid}
              name={isScreenSharing && !pinnedScreenSid ? 'Your screen' : `${pinnedScreenName}'s screen`}
              videoOn
              audioOn
            />
          ) : (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.disabled">No screen to display</Typography>
            </Box>
          )}
        </Box>

        {/* Right-rail camera thumbnails */}
        <Box
          sx={{
            width: 176,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            p: 1,
            overflowY: 'auto',
            borderLeft: 1,
            borderColor: 'divider',
          }}
        >
          {allCameraTiles.map(({ key, stream, muted, name, avatar, videoOn, audioOn, connectionState, handRaised: hr, reaction, isSpeaker }) => (
            <Box key={key} sx={{ width: '100%', aspectRatio: '16/9', flexShrink: 0, borderRadius: 1, overflow: 'hidden' }}>
              <VideoTile
                stream={stream}
                muted={muted}
                name={name}
                avatar={avatar}
                videoOn={videoOn}
                audioOn={audioOn}
                connectionState={connectionState}
                handRaised={hr}
                activeReaction={reaction}
                activeSpeaker={isSpeaker}
              />
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  // 1:1 layout
  function renderSoloLayout() {
    const [peerId, stream] = remoteEntries[0];
    const ps = peerStates[peerId];
    return (
      <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
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
          />
        </Box>
        {localStream && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              width: 200,
              height: 150,
              borderRadius: 2,
              overflow: 'hidden',
              boxShadow: 4,
              border: '2px solid',
              borderColor: 'divider',
              zIndex: 1,
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
            />
          </Box>
        )}
      </Box>
    );
  }

  // Grid layout (0 or 2+ peers, no screen share)
  function renderGridLayout() {
    return (
      <Box sx={{ flex: 1, position: 'relative', minHeight: 0, p: 2 }}>
        <Box
          sx={{
            height: '100%',
            display: 'grid',
            gap: 2,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gridAutoRows: '1fr',
            alignContent: 'center',
          }}
        >
          {localStream && (
            <VideoTile
              stream={localStream}
              muted
              name={`${user?.name ?? 'You'} (You)`}
              avatar={user?.avatar}
              videoOn={localVideoOn}
              audioOn={localAudioOn}
              activeReaction={activeReactions[socket.id]}
            />
          )}
          {remoteEntries.map(([peerId, stream]) => {
            const ps = peerStates[peerId];
            return (
              <VideoTile
                key={peerId}
                stream={stream}
                name={ps?.name ?? 'Participant'}
                avatar={ps?.avatar}
                videoOn={ps ? ps.video : stream.getVideoTracks().length > 0}
                audioOn={ps ? ps.audio : true}
                connectionState={peerConnectionStates[peerId]}
                handRaised={ps?.handRaised ?? false}
                activeReaction={activeReactions[peerId]}
                activeSpeaker={activeSpeaker === peerId}
              />
            );
          })}
          {remoteEntries.length === 0 && (
            <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', alignSelf: 'center' }}>
              <Typography variant="body2" color="text.disabled">
                Waiting for someone to join…
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {roomId}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {users.length} {users.length === 1 ? 'person' : 'people'} in room
          </Typography>
          {isScreenSharing && (
            <Chip label="You are presenting" size="small" color="primary" sx={{ ml: 1, fontSize: 11 }} />
          )}
        </Box>
        <Stack direction="row" spacing={0.5}>
          {users.map((u) => (
            <Tooltip key={u.id} title={u.name}>
              <Avatar src={u.avatar} alt={u.name} sx={{ width: 28, height: 28, fontSize: 12 }}>
                {u.name?.[0]}
              </Avatar>
            </Tooltip>
          ))}
        </Stack>
      </Box>

      {/* Body: video area + optional chat panel */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Video area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, bgcolor: 'background.default' }}>
          {hasScreen
            ? renderPresentationLayout()
            : isSoloCall
              ? renderSoloLayout()
              : renderGridLayout()}

          {/* Control bar */}
          <Stack
            direction="row"
            spacing={1.5}
            justifyContent="center"
            sx={{ py: 1.5, borderTop: 1, borderColor: 'divider' }}
          >
            <Tooltip title={!hasMic ? 'No microphone' : localAudioOn ? 'Mute' : 'Unmute'}>
              <span>
                <IconButton
                  onClick={toggleAudio}
                  disabled={!hasMic}
                  sx={{
                    bgcolor: localAudioOn ? 'action.hover' : 'error.main',
                    color: localAudioOn ? 'text.primary' : 'error.contrastText',
                    '&:hover': { bgcolor: localAudioOn ? 'action.selected' : 'error.dark' },
                  }}
                >
                  {localAudioOn ? <MicIcon /> : <MicOffIcon />}
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title={!hasCamera ? 'No camera' : localVideoOn ? 'Turn off camera' : 'Turn on camera'}>
              <span>
                <IconButton
                  onClick={toggleVideo}
                  sx={{
                    bgcolor: localVideoOn ? 'action.hover' : 'error.main',
                    color: localVideoOn ? 'text.primary' : 'error.contrastText',
                    '&:hover': { bgcolor: localVideoOn ? 'action.selected' : 'error.dark' },
                  }}
                >
                  {localVideoOn ? <VideocamIcon /> : <VideocamOffIcon />}
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
              <IconButton
                onClick={isScreenSharing ? stopScreenShare : shareScreen}
                sx={{
                  bgcolor: isScreenSharing ? 'primary.main' : 'action.hover',
                  color: isScreenSharing ? 'primary.contrastText' : 'text.primary',
                  '&:hover': { bgcolor: isScreenSharing ? 'primary.dark' : 'action.selected' },
                }}
              >
                {isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
              </IconButton>
            </Tooltip>

            <Tooltip title={handRaised ? 'Lower hand' : 'Raise hand'}>
              <IconButton
                onClick={toggleHand}
                sx={{
                  bgcolor: handRaised ? 'warning.main' : 'action.hover',
                  color: handRaised ? 'warning.contrastText' : 'text.primary',
                  '&:hover': { bgcolor: handRaised ? 'warning.dark' : 'action.selected' },
                }}
              >
                <PanToolIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="React">
              <IconButton
                onClick={(e) => setReactionAnchor(e.currentTarget)}
                sx={{ bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}
              >
                <EmojiEmotionsIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title={showChat ? 'Hide chat' : 'Show chat'}>
              <IconButton
                onClick={() => setShowChat((v) => !v)}
                sx={{ bgcolor: showChat ? 'action.hover' : 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}
              >
                <Badge badgeContent={!showChat ? unreadCount : 0} color="error" max={9}>
                  <ChatIcon sx={{ color: showChat ? 'primary.main' : 'text.primary' }} />
                </Badge>
              </IconButton>
            </Tooltip>

            <Tooltip title="Leave call">
              <IconButton
                onClick={() => navigate('/')}
                sx={{
                  bgcolor: 'error.main',
                  color: 'error.contrastText',
                  '&:hover': { bgcolor: 'error.dark' },
                }}
              >
                <CallEndIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Chat panel */}
        {showChat && (
          <Box
            sx={{
              width: 360,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              borderLeft: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
              {messages.length === 0 && (
                <Box sx={{ textAlign: 'center', mt: 6 }}>
                  <Typography variant="body2" color="text.disabled">
                    Say hello — you're the first here.
                  </Typography>
                </Box>
              )}
              {messages.map((msg, i) => {
                if (msg.type === 'event') {
                  return (
                    <Box key={i} sx={{ textAlign: 'center', my: 1 }}>
                      <Chip
                        label={msg.text}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: 11, color: 'text.disabled', borderColor: 'divider' }}
                      />
                    </Box>
                  );
                }
                const isMe = msg.sender?.id === user?.id;
                return (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      flexDirection: isMe ? 'row-reverse' : 'row',
                      alignItems: 'flex-end',
                      gap: 1,
                      mb: 1.5,
                    }}
                  >
                    {!isMe && (
                      <Tooltip title={msg.sender?.name}>
                        <Avatar src={msg.sender?.avatar} alt={msg.sender?.name} sx={{ width: 28, height: 28, fontSize: 12 }}>
                          {msg.sender?.name?.[0]}
                        </Avatar>
                      </Tooltip>
                    )}
                    <Box sx={{ maxWidth: '70%' }}>
                      {!isMe && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                          {msg.sender?.name}
                        </Typography>
                      )}
                      <Box
                        sx={{
                          px: 1.5,
                          py: 1,
                          borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          bgcolor: isMe ? 'primary.main' : 'action.hover',
                          color: isMe ? 'primary.contrastText' : 'text.primary',
                          wordBreak: 'break-word',
                        }}
                      >
                        <Typography variant="body2">{msg.text}</Typography>
                      </Box>
                      <Typography variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                        {formatTime(msg.ts)}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
              <div ref={bottomRef} />
            </Box>

            <Divider />

            <Box component="form" onSubmit={sendMessage} sx={{ px: 2, py: 1.5 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Send a message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton type="submit" size="small" disabled={!input.trim()} color="primary">
                          <SendIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>
          </Box>
        )}
      </Box>

      {/* Emoji reaction picker */}
      <Popover
        open={Boolean(reactionAnchor)}
        anchorEl={reactionAnchor}
        onClose={() => setReactionAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Stack direction="row" sx={{ p: 0.5 }}>
          {REACTION_EMOJIS.map((emoji) => (
            <IconButton key={emoji} onClick={() => sendReaction(emoji)} size="small" sx={{ fontSize: 22 }}>
              {emoji}
            </IconButton>
          ))}
        </Stack>
      </Popover>
    </Box>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Avatar, Box, Chip, Divider, IconButton, InputAdornment,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  CallEnd as CallEndIcon,
  Send as SendIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import socket from '../services/socket';
import { useWebRTC } from '../hooks/useWebRTC';
import VideoTile from '../components/VideoTile';

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
  const bottomRef = useRef(null);

  const devices = {
    videoDeviceId: locationState?.videoDeviceId ?? null,
    audioDeviceId: locationState?.audioDeviceId ?? null,
    startVideoOn: locationState?.startVideoOn ?? true,
    startAudioOn: locationState?.startAudioOn ?? true,
  };

  const {
    localStream, remoteStreams, peerStates, peerConnectionStates,
    localVideoOn, localAudioOn, hasCamera, hasMic,
    toggleVideo, toggleAudio,
  } = useWebRTC(roomId, devices);
  const remoteEntries = Object.entries(remoteStreams);
  const isSoloCall = remoteEntries.length === 1;

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
    });

    return () => {
      socket.off('room-users');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('chat-message');
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    socket.emit('chat-message', { roomId, text });
    setInput('');
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

      {/* Body: video area + chat panel */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Video area */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            bgcolor: 'background.default',
          }}
        >
          {/* Tile grid */}
          <Box sx={{ flex: 1, position: 'relative', minHeight: 0, p: isSoloCall ? 0 : 2 }}>
            {isSoloCall ? (
              // 1:1 layout: remote fills area, local is PiP
              <>
                <Box sx={{ position: 'absolute', inset: 0 }}>
                  {(() => {
                    const [peerId, stream] = remoteEntries[0];
                    const ps = peerStates[peerId];
                    return (
                      <VideoTile
                        stream={stream}
                        name={ps?.name ?? 'Participant'}
                        avatar={ps?.avatar}
                        videoOn={ps ? ps.video : stream.getVideoTracks().length > 0}
                        audioOn={ps ? ps.audio : true}
                        connectionState={peerConnectionStates[peerId]}
                      />
                    );
                  })()}
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
                    />
                  </Box>
                )}
              </>
            ) : (
              // Grid layout: 0 or 2+ remote peers
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
            )}
          </Box>

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
          {/* Message list */}
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

          {/* Input */}
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
      </Box>
    </Box>
  );
}

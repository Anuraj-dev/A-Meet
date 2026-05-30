import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Avatar, Box, Chip, Divider, IconButton, InputAdornment,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Send as SendIcon } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import socket from '../services/socket';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

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
        <Tooltip title="Leave">
          <IconButton size="small" onClick={() => navigate('/')}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>
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
                <Chip label={msg.text} size="small" variant="outlined" sx={{ fontSize: 11, color: 'text.disabled', borderColor: 'divider' }} />
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
  );
}

import { useEffect, useRef } from 'react';
import {
  Avatar, Box, Chip, IconButton, InputAdornment, TextField, Tooltip, Typography,
} from '@mui/material';
import { Close as CloseIcon, Send as SendIcon } from '@mui/icons-material';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// In-call chat. Desktop: a floating rounded side panel in the layout flow.
// Mobile: a full-screen sheet overlaying the call (own close button + input).
export default function ChatPanel({ messages, input, setInput, onSend, currentUserId, onClose }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <Box
      sx={{
        // Mobile: fixed full-screen overlay. Desktop: in-flow side column.
        position: { xs: 'fixed', sm: 'relative' },
        inset: { xs: 0, sm: 'auto' },
        zIndex: { xs: 1300, sm: 'auto' },
        width: { xs: '100%', sm: 372 },
        flexShrink: 0,
        m: { xs: 0, sm: 1 },
        ml: { sm: 0 },
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        bgcolor: 'background.paper',
        borderRadius: { xs: 0, sm: 3 },
        border: { sm: '1px solid rgba(255,255,255,0.06)' },
        animation: 'ameet-fade-in 0.22s ease-out',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2, py: 1.5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Typography sx={{ fontFamily: '"Outfit", sans-serif', fontWeight: 600 }}>
          In-call messages
        </Typography>
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Messages */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', mt: 6, px: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Messages can be seen by everyone in the call. Say hello 👋
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
                  sx={{ fontSize: 11, color: 'text.secondary', borderColor: 'divider' }}
                />
              </Box>
            );
          }
          const isMe = msg.sender?.id === currentUserId;
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
                <Tooltip title={msg.sender?.name ?? ''}>
                  <Avatar src={msg.sender?.avatar} alt={msg.sender?.name} sx={{ width: 30, height: 30, fontSize: 13 }}>
                    {msg.sender?.name?.[0]}
                  </Avatar>
                </Tooltip>
              )}
              <Box sx={{ maxWidth: '74%' }}>
                {!isMe && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    {msg.sender?.name}
                  </Typography>
                )}
                <Box
                  sx={{
                    px: 1.5, py: 1,
                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    bgcolor: isMe ? 'primary.main' : 'rgba(255,255,255,0.08)',
                    color: isMe ? 'primary.contrastText' : 'text.primary',
                    wordBreak: 'break-word',
                  }}
                >
                  <Typography variant="body2">{msg.text}</Typography>
                </Box>
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ display: 'block', textAlign: isMe ? 'right' : 'left', mx: 0.5, mt: 0.25 }}
                >
                  {formatTime(msg.ts)}
                </Typography>
              </Box>
            </Box>
          );
        })}
        <div ref={bottomRef} />
      </Box>

      {/* Composer */}
      <Box component="form" onSubmit={onSend} sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Send a message to everyone"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          slotProps={{
            input: {
              sx: { borderRadius: 999, bgcolor: 'rgba(255,255,255,0.04)' },
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

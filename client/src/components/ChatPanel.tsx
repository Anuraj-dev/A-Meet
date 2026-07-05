import { useEffect, useRef, type FormEvent } from 'react';
import {
  Avatar, Box, Chip, IconButton, InputAdornment, TextField, Tooltip, Typography,
} from '@mui/material';
import { Close as CloseIcon, Send as SendIcon } from '@mui/icons-material';

interface ChatSender { id: string; name?: string; avatar?: string }
export interface ChatMessage { id?: string; type?: 'event' | 'chat'; text: string; ts: string | number | Date; sender?: ChatSender }
interface ChatPanelProps {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  onSend: (event: FormEvent) => void;
  currentUserId?: string;
  onClose: () => void;
}

function formatTime(ts: string | number | Date): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Stable React key tied to message identity, not array position — so React
// reconciles rows correctly when the list grows or a message is prepended.
// Prefer a server id; otherwise compose from timestamp + sender + text, which
// is effectively unique per real message.
function messageKey(msg: ChatMessage): string {
  if (msg.id) return msg.id;
  const sender = msg.sender?.id ?? (msg.type === 'event' ? 'event' : 'anon');
  return `${new Date(msg.ts).getTime()}:${sender}:${msg.text}`;
}

// In-call chat. Desktop: a 372px wide in-flow side column.
// Mobile: a bottom sheet (62vh, slides up over the video, with backdrop).
export default function ChatPanel({ messages, input, setInput, onSend, currentUserId, onClose }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <>
      {/* Mobile backdrop */}
      <Box
        onClick={onClose}
        sx={{
          display: { xs: 'block', sm: 'none' },
          position: 'fixed',
          inset: 0,
          zIndex: 1299,
          bgcolor: 'rgba(0,0,0,0.55)',
        }}
      />
      <Box
        data-testid="chat-panel"
        sx={{
          // Mobile: bottom sheet. Desktop: in-flow side column.
          position: { xs: 'fixed', sm: 'relative' },
          bottom: { xs: 0, sm: 'auto' },
          left: { xs: 0, sm: 'auto' },
          right: { xs: 0, sm: 'auto' },
          zIndex: { xs: 1300, sm: 'auto' },
          width: { xs: '100%', sm: 372 },
          height: { xs: '62vh', sm: 'auto' },
          flexShrink: 0,
          m: { xs: 0, sm: 1 },
          ml: { sm: 0 },
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          bgcolor: { xs: 'rgba(10,12,22,0.97)', sm: 'background.paper' },
          borderRadius: { xs: '20px 20px 0 0', sm: 3 },
          border: { sm: '1px solid rgba(255,255,255,0.06)' },
          boxShadow: { xs: '0 -8px 40px rgba(0,0,0,0.6)', sm: 'none' },
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          animation: 'ameet-fade-in 0.22s ease-out',
        }}
      >
        {/* Drag handle — mobile only */}
        <Box sx={{
          display: { xs: 'flex', sm: 'none' },
          justifyContent: 'center',
          pt: 1.25,
          pb: 0.5,
          flexShrink: 0,
        }}>
          <Box sx={{ width: 40, height: 4, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.2)' }} />
        </Box>
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
          <IconButton aria-label="Close" size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
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

        {messages.map((msg) => {
          const key = messageKey(msg);
          if (msg.type === 'event') {
            return (
              <Box key={key} sx={{ textAlign: 'center', my: 1 }}>
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
              key={key}
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
                  <IconButton type="submit" size="small" aria-label="Send message" disabled={!input.trim()} color="primary">
                    <SendIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
    </Box>
    </>
  );
}

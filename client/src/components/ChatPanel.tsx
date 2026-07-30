import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Avatar, Box, Chip, IconButton, InputAdornment, Modal, TextField, Tooltip, Typography,
  useMediaQuery,
} from '@mui/material';
import {
  Check as CheckIcon,
  Close as CloseIcon,
  ContentCopy as ContentCopyIcon,
  ErrorOutlineOutlined as ErrorOutlineIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import { usePanelDialog } from '../hooks/usePanelDialog';

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

type CopyFeedback = { key: string; status: 'copied' | 'failed' };

const COPY_FEEDBACK_MS = 1800;

function formatTime(ts: string | number | Date): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function senderLabel(msg: ChatMessage): string {
  return msg.sender?.name?.trim() || 'Unknown';
}

// Stable React key tied to message identity, not array position — so React
// reconciles rows correctly when the list grows or a message is prepended.
// Prefer a server id; otherwise fall back to a key minted per message object
// (messages are appended once and never re-created, so object identity is
// stable across renders and unique even for byte-identical messages).
const fallbackKeys = new WeakMap<ChatMessage, string>();
let fallbackKeyCounter = 0;
function messageKey(msg: ChatMessage): string {
  if (msg.id) return msg.id;
  let key = fallbackKeys.get(msg);
  if (!key) {
    fallbackKeyCounter += 1;
    key = `local:${fallbackKeyCounter}`;
    fallbackKeys.set(msg, key);
  }
  return key;
}

// In-call chat. Desktop: a 372px wide in-flow side column.
// Mobile: a bottom sheet (62vh, slides up over the video, with backdrop).
export default function ChatPanel({ messages, input, setInput, onSend, currentUserId, onClose }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic token so only the latest copy request may apply feedback.
  const copyRequestId = useRef(0);
  const unmountedRef = useRef(false);
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const { initialFocusRef, panelRef, onKeyDown } = usePanelDialog<HTMLHeadingElement>(onClose);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
    };
  }, []);

  function showCopyFeedback(key: string, status: CopyFeedback['status']) {
    if (unmountedRef.current) return;
    if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
    setCopyFeedback({ key, status });
    copyFeedbackTimer.current = setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimer.current = null;
    }, COPY_FEEDBACK_MS);
  }

  async function copyMessage(key: string, text: string) {
    const requestId = ++copyRequestId.current;
    try {
      await navigator.clipboard.writeText(text);
      // Ignore stale settlements and post-unmount completions.
      if (unmountedRef.current || requestId !== copyRequestId.current) return;
      showCopyFeedback(key, 'copied');
    } catch {
      if (unmountedRef.current || requestId !== copyRequestId.current) return;
      showCopyFeedback(key, 'failed');
    }
  }

  const panel = (
    <Box
        ref={panelRef}
        data-testid="chat-panel"
        role="dialog"
        aria-label="In-call messages"
        onKeyDown={onKeyDown}
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
        <Typography
          component="h2"
          ref={initialFocusRef}
          tabIndex={-1}
          sx={{ fontFamily: '"Outfit", sans-serif', fontWeight: 600 }}
        >
          In-call messages
        </Typography>
        <Tooltip title="Close">
          <IconButton aria-label="Close" size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Messages — role="log" so assistive tech politely announces new entries */}
      <Box role="log" aria-label="Chat messages" sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
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
          const from = senderLabel(msg);
          const idleCopyLabel = `Copy message from ${from}`;
          const feedback = copyFeedback?.key === key ? copyFeedback.status : null;
          const copyLabel =
            feedback === 'copied' ? 'Copied'
              : feedback === 'failed' ? "Couldn't copy"
                : idleCopyLabel;
          return (
            <Box
              key={key}
              sx={{
                display: 'flex',
                flexDirection: isMe ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: 0.5,
                mb: 1.5,
                // Reveal copy control on row hover / keyboard focus; always on touch.
                '&:hover .chat-copy-btn, &:focus-within .chat-copy-btn': { opacity: 1 },
                '@media (hover: none)': { '& .chat-copy-btn': { opacity: 1 } },
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
              {/* Copy sits at the bubble edge (sibling, not absolute — avoids overflow clip). */}
              <Tooltip title={copyLabel}>
                <IconButton
                  className="chat-copy-btn"
                  size="small"
                  aria-label={copyLabel}
                  onClick={() => { void copyMessage(key, msg.text); }}
                  sx={{
                    alignSelf: 'center',
                    opacity: 0,
                    transition: 'opacity 0.15s ease',
                    color: 'text.secondary',
                    width: 28,
                    height: 28,
                    // Stay visible while keyboard-focused even after hover ends.
                    '&:focus-visible': { opacity: 1 },
                  }}
                >
                  {feedback === 'copied' ? (
                    <CheckIcon sx={{ fontSize: 16 }} />
                  ) : feedback === 'failed' ? (
                    <ErrorOutlineIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </Tooltip>
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
  );

  if (!isMobile) return panel;

  return (
    <Modal
      open
      onClose={onClose}
      keepMounted={false}
      slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.55)' } } }}
    >
      {panel}
    </Modal>
  );
}

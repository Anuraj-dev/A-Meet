import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Avatar, Box, Button, Chip, IconButton, InputAdornment, Link, Modal, TextField, Tooltip, Typography,
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
export interface ChatMessage { id?: string; kind?: 'text'; type?: 'event' | 'chat'; text: string; ts: string | number | Date; sender?: ChatSender }
const CHAT_MESSAGE_LIMIT = 16_000;
const CHAT_COUNTER_THRESHOLD = 14_000;
/** Collapse when text exceeds this many characters (spec: ~800). */
const COLLAPSE_CHAR_LIMIT = 800;
/** Collapse when text spans more than this many lines (spec: ~12). */
const COLLAPSE_LINE_LIMIT = 12;

function messageNeedsCollapse(text: string): boolean {
  if (text.length > COLLAPSE_CHAR_LIMIT) return true;
  // split counts hard newlines as rendered line breaks (pre-wrap).
  return text.split('\n').length > COLLAPSE_LINE_LIMIT;
}

// Web-URL-only linkification (#197): tokenizer producing React nodes — never
// dangerouslySetInnerHTML. Allowlist http/https only; www. → https://www.
// Other schemes (javascript:, data:, mailto:, custom) stay plain inert text.

/** Punctuation commonly trailing a URL in prose (excluded from the href). */
const TRAILING_PUNCT = /[.,;:!?)"'\]]/;
/**
 * Characters that can continue a URL, hostname, or email token. When one sits
 * immediately before a candidate, that candidate is a fragment of a larger
 * token (`foohttps://x`, `bob@www.x.com`, `mail.www.x.com`, `file://www.x.com`),
 * not a link of its own. Every other character — prose punctuation, markdown,
 * dashes, smart quotes, `=`, `>` — is a real boundary.
 */
const URL_CONTINUATION_BEFORE = /[\p{L}\p{M}\p{N}_.\-@+~%/:]/u;
/** A `scheme:`, matched in place (sticky) so no substring is materialized. */
const SCHEME_AT = /[A-Za-z][A-Za-z0-9+.-]*:/y;
/** Wrapper a scheme can hide behind — `(`, `"`, `>`, `*` … — skipped before the check. */
const WRAPPER_CHAR = /[^\p{L}\p{N}]/u;
/**
 * Characters that end a candidate without ending a token — exactly the
 * candidate charset's non-whitespace exclusions. Each one starts a new segment,
 * because every position where a fresh candidate can begin must also be a
 * position where a fresh scheme is looked for; otherwise a scheme hides in a
 * segment's interior (`https://ok.example"javascript:https://evil.example`).
 */
const SEGMENT_SEPARATOR = /[<>"'`{},;|\\^[\]\p{Cc}]/u;
/** Token delimiter: tokens are the unit the scheme guard poisons or clears. */
const WHITESPACE = /\s/;

/**
 * The code point ending at `index`, as a string. Reading `text[index - 1]` alone
 * would expose only the low surrogate of an astral character, so `𐐀https://…`
 * would escape a `\p{L}` test and linkify.
 */
function codePointBefore(text: string, index: number): string {
  const prev = text.charCodeAt(index - 1);
  const isLowSurrogate = prev >= 0xdc00 && prev <= 0xdfff;
  if (isLowSurrogate && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(index - 2, index);
  }
  return text[index - 1]!;
}

/** True when `href` parses as an http(s) URL with a dotted hostname. */
function isWebUrl(href: string): boolean {
  try {
    const parsed = new URL(href);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * True when `text[from, to)` opens with a scheme other than http/https. Indices
 * only — nothing is sliced but the scheme name itself, so repeated checks over
 * one long token stay linear rather than materializing growing prefixes.
 */
function segmentHasForeignScheme(text: string, from: number, to: number): boolean {
  let i = from;
  while (i < to && WRAPPER_CHAR.test(text[i]!)) i += 1;
  if (i >= to) return false;
  SCHEME_AT.lastIndex = i;
  // Scheme characters exclude `,`, `;` and whitespace, so a sticky match can
  // never run past `to` — the segment's own end always stops it.
  const scheme = SCHEME_AT.exec(text)?.[0];
  if (!scheme) return false;
  const name = scheme.slice(0, -1).toLowerCase();
  return name !== 'http' && name !== 'https';
}

/**
 * True when any `,`/`;` segment of the token `text[tokenStart, tokenEnd)` opens
 * with a non-web scheme. The whole token is then inert — `data:text/plain,https://…`,
 * `javascript:;https://…`, and equally `https://ok.example,javascript:https://evil`,
 * where the foreign scheme trails the candidate. Security cannot rest on the one
 * character before a candidate, since `,`/`;` are legitimate prose boundaries.
 */
function tokenHasForeignScheme(text: string, tokenStart: number, tokenEnd: number): boolean {
  let segmentStart = tokenStart;
  for (let i = tokenStart; i <= tokenEnd; i += 1) {
    if (i === tokenEnd || SEGMENT_SEPARATOR.test(text[i]!)) {
      if (segmentHasForeignScheme(text, segmentStart, i)) return true;
      segmentStart = i + 1;
    }
  }
  return false;
}

/**
 * Scan `text` for http(s) and bare-www URLs; return an array of text spans and
 * MUI Link elements. Malformed candidates and non-web schemes are left as text.
 */
function linkifyMessageText(text: string): ReactNode[] {
  // Match http://, https://, or www. then a run of URL-ish characters. The
  // excluded characters terminate a candidate, so adjacent URLs never fuse into
  // a single anchor (a genuine trailing `,`/`;` was peeled off anyway); the
  // non-whitespace ones are exactly `SEGMENT_SEPARATOR`, keeping "where a
  // candidate may start" and "where a scheme is checked" the same set.
  const candidateRe = /(?:https?:\/\/|www\.)[^\s<>"'`{},;|\\^[\]\p{Cc}]+/giu;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let cursor = 0;
  // A match found while scanning an earlier token, held until the token walk
  // reaches the token it falls in. Matches arrive in order, so the regex never
  // rescans: `lastIndex` only moves forward and each character is examined once.
  let carried: RegExpExecArray | null = null;
  let exhausted = false;

  // Walk whitespace-delimited tokens. A token is the unit of trust: it is swept
  // for foreign schemes *in full* before any of its candidates may become a
  // link, so a scheme trailing the candidate poisons it just as one leading it
  // does. Every character is visited once by the token walk and once by the
  // regex — O(n) overall.
  while (cursor < text.length) {
    if (WHITESPACE.test(text[cursor]!)) {
      cursor += 1;
      continue;
    }
    const tokenStart = cursor;
    while (cursor < text.length && !WHITESPACE.test(text[cursor]!)) cursor += 1;
    const tokenEnd = cursor;

    if (tokenHasForeignScheme(text, tokenStart, tokenEnd)) {
      // Poisoned: drop a carried match belonging to this token and resume the
      // regex past the token, so none of its candidates can be linked.
      if (carried !== null && carried.index < tokenEnd) carried = null;
      if (candidateRe.lastIndex < tokenEnd) candidateRe.lastIndex = tokenEnd;
      continue;
    }

    // Candidates exclude whitespace, so a match starting inside the token also
    // ends inside it; one starting past `tokenEnd` belongs to a later token.
    for (;;) {
      let match: RegExpExecArray | null = carried;
      carried = null;
      if (match === null) {
        if (exhausted) break;
        if (candidateRe.lastIndex < tokenStart) candidateRe.lastIndex = tokenStart;
        match = candidateRe.exec(text);
        if (match === null) {
          exhausted = true;
          break;
        }
      }
      if (match.index >= tokenEnd) {
        carried = match;
        break;
      }
      let raw = match[0];
      const start = match.index;

      // Require a real boundary before the candidate so "foohttps://..." stays text.
      if (start > 0 && URL_CONTINUATION_BEFORE.test(codePointBefore(text, start))) {
        continue;
      }

      // Peel trailing punctuation so "https://example.com." keeps the period outside.
      // Count parens once, then peel by index and slice once — O(n) total, not O(n²).
      let openParens = 0;
      let closeParens = 0;
      for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i]!;
        if (ch === '(') openParens += 1;
        else if (ch === ')') closeParens += 1;
      }
      let end = raw.length;
      while (end > 0 && TRAILING_PUNCT.test(raw[end - 1]!)) {
        const last = raw[end - 1]!;
        // Keep a closing ')' when the URL still has an unmatched '('.
        if (last === ')') {
          if (openParens >= closeParens) break;
          closeParens -= 1;
        }
        end -= 1;
      }
      raw = raw.slice(0, end);

      if (!raw) continue;

      const href = raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw;

      // Validate with the URL parser: only http/https with a real hostname
      // survive. Malformed (e.g. bare "https://") stays plain text via lastIndex.
      if (!isWebUrl(href)) continue;

      if (start > lastIndex) {
        nodes.push(text.slice(lastIndex, start));
      }
      nodes.push(
        <Link
          key={`link-${key}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          underline="always"
          color="inherit"
          // Inherit bubble text color so links read on both own/other bubbles.
          sx={{ wordBreak: 'break-all' }}
        >
          {raw}
        </Link>,
      );
      key += 1;
      lastIndex = start + raw.length;
      // Reposition regex after the linked span (trailing punct stays for next slice).
      candidateRe.lastIndex = lastIndex;
    }
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length > 0 ? nodes : [text];
}
interface ChatPanelProps {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  onSend: (event: FormEvent) => void;
  sendError?: string;
  sending: boolean;
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
export default function ChatPanel({ messages, input, setInput, onSend, sendError, sending, currentUserId, onClose }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic token so only the latest copy request may apply feedback.
  const copyRequestId = useRef(0);
  const unmountedRef = useRef(false);
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const { initialFocusRef, panelRef, onKeyDown } = usePanelDialog<HTMLHeadingElement>(onClose);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  // Session-local expansion for long messages — per client, per message key.
  const [expandedMessages, setExpandedMessages] = useState<ReadonlySet<string>>(() => new Set());
  const tooLong = input.length > CHAT_MESSAGE_LIMIT;
  const composerError = tooLong
    ? `Messages can be at most ${CHAT_MESSAGE_LIMIT} characters.`
    : sendError;

  function handleSubmit(event: FormEvent) {
    if (tooLong) {
      event.preventDefault();
      return;
    }
    onSend(event);
  }

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

  function toggleMessageExpanded(key: string) {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
          const collapsible = messageNeedsCollapse(msg.text);
          const expanded = expandedMessages.has(key);
          const collapsed = collapsible && !expanded;
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
                  <Typography
                    variant="body2"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      ...(collapsed && {
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: COLLAPSE_LINE_LIMIT,
                        overflow: 'hidden',
                      }),
                    }}
                  >
                    {linkifyMessageText(msg.text)}
                  </Typography>
                  {collapsible && (
                    <Button
                      type="button"
                      size="small"
                      onClick={() => toggleMessageExpanded(key)}
                      aria-expanded={expanded}
                      sx={{
                        mt: 0.5,
                        p: 0,
                        minWidth: 0,
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        lineHeight: 1.4,
                        color: isMe ? 'inherit' : 'primary.main',
                        opacity: isMe ? 0.9 : 1,
                        '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
                      }}
                    >
                      {expanded ? 'Show less' : 'Show more'}
                    </Button>
                  )}
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
      <Box component="form" onSubmit={handleSubmit} sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Send a message to everyone"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          error={Boolean(composerError)}
          helperText={composerError}
          slotProps={{
            input: {
              sx: { borderRadius: 999, bgcolor: 'rgba(255,255,255,0.04)' },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton type="submit" size="small" aria-label="Send message" disabled={!input.trim() || tooLong || sending} color="primary">
                    <SendIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        {input.length > CHAT_COUNTER_THRESHOLD && (
          <Typography
            variant="caption"
            color={tooLong ? 'error' : 'text.secondary'}
            sx={{ display: 'block', mt: 0.5, textAlign: 'right' }}
          >
            {input.length} / {CHAT_MESSAGE_LIMIT}
          </Typography>
        )}
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

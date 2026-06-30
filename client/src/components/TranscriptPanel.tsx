import { useEffect, useRef } from 'react';
import {
  Avatar, Box, Button, Chip, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  GraphicEq as ListeningIcon,
  Notes as NotesIcon,
  StopCircleOutlined as StopIcon,
} from '@mui/icons-material';

interface TranscriptSpeaker { name?: string; avatar?: string }
interface TranscriptEntry {
  id: string;
  speaker?: TranscriptSpeaker;
  ts: string | number | Date;
  text: string;
}
interface TranscriptInterim {
  utteranceId: string;
  speaker?: TranscriptSpeaker;
  text: string;
}
interface TranscriptPanelProps {
  open: boolean;
  entries: TranscriptEntry[];
  active: boolean;
  interims: TranscriptInterim[];
  contributorStatus: string;
  contributorError?: string;
  isHost: boolean;
  canContribute: boolean;
  onEnableContribution: () => void;
  onStop: () => void;
  onDownload: () => void;
  onClose: () => void;
}

function formatTime(ts: string | number | Date): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function TranscriptPanel({
  open,
  entries,
  active,
  interims,
  contributorStatus,
  contributorError,
  isHost,
  canContribute,
  onEnableContribution,
  onStop,
  onDownload,
  onClose,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, entries.length, interims.length]);

  if (!open) return null;

  return (
    <Box
      component="aside"
      aria-label="Meeting transcript"
      sx={{
        position: { xs: 'absolute', sm: 'relative' },
        inset: { xs: '64px 0 0', sm: 'auto' },
        zIndex: 20,
        width: { xs: '100%', sm: 370 },
        minWidth: { sm: 370 },
        height: { xs: 'calc(100% - 64px)', sm: '100%' },
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'rgba(8,10,20,0.96)',
        borderLeft: { sm: '1px solid rgba(255,255,255,0.10)' },
        backdropFilter: 'blur(22px)',
      }}
    >
      <Box sx={{ px: 2.25, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ textAlign: 'left' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography sx={{ fontFamily: '"Outfit", sans-serif', fontWeight: 650, fontSize: 18 }}>
                Meeting transcript
              </Typography>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: active ? 'error.main' : 'text.disabled' }} />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              One shared transcript · English
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.25}>
            <Tooltip title={entries.length ? 'Download shared transcript' : 'Nothing to download yet'}>
              <span>
                <IconButton aria-label="Download transcript" onClick={onDownload} disabled={!entries.length}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton aria-label="Close transcript" onClick={onClose}><CloseIcon /></IconButton>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <Chip
            size="small"
            icon={<ListeningIcon />}
            label={active ? 'Live' : 'Stopped'}
            color={active ? 'error' : 'default'}
            variant={active ? 'filled' : 'outlined'}
          />
          {isHost && active ? (
            <Button size="small" color="inherit" startIcon={<StopIcon />} onClick={onStop} sx={{ ml: 'auto !important' }}>
              Stop for everyone
            </Button>
          ) : null}
        </Stack>
      </Box>

      {active && !canContribute ? (
        <Box sx={{ mx: 2, mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'rgba(42,180,160,0.08)', border: '1px solid rgba(42,180,160,0.22)', textAlign: 'left' }}>
          <Typography variant="body2" sx={{ fontWeight: 650 }}>Your microphone is not contributing yet</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', my: 0.75 }}>
            Allow English speech recognition so your words can be added to the shared transcript.
          </Typography>
          <Button size="small" variant="contained" onClick={onEnableContribution}>Enable my transcription</Button>
        </Box>
      ) : null}

      {contributorError ? (
        <Typography variant="caption" color="error.light" sx={{ px: 2.25, pt: 1.25, textAlign: 'left' }}>
          {contributorError}
        </Typography>
      ) : null}

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.25, py: 2, contentVisibility: 'auto' }}>
        {!entries.length && !interims.length ? (
          <Stack sx={{ alignItems: 'center', justifyContent: 'center', minHeight: 260, color: 'text.secondary', textAlign: 'center', px: 3 }}>
            <NotesIcon sx={{ fontSize: 36, mb: 1.5, opacity: 0.5 }} />
            <Typography sx={{ fontWeight: 650, color: 'text.primary' }}>The conversation will appear here</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Finalized speech from every participating microphone is merged by the server.
            </Typography>
          </Stack>
        ) : null}

        <Stack spacing={2.25}>
          {entries.map((entry) => (
            <Box key={entry.id} sx={{ display: 'flex', gap: 1.25, textAlign: 'left' }}>
              <Avatar src={entry.speaker?.avatar} alt="" sx={{ width: 30, height: 30, fontSize: 12 }}>
                {entry.speaker?.name?.[0] || '?'}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{entry.speaker?.name || 'Participant'}</Typography>
                  <Typography variant="caption" color="text.disabled">{formatTime(entry.ts)}</Typography>
                </Stack>
                <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.55, mt: 0.35, wordBreak: 'break-word' }}>
                  {entry.text}
                </Typography>
              </Box>
            </Box>
          ))}
          {interims.map((interim) => (
            <Box key={interim.utteranceId} role="status" aria-live="polite" sx={{ display: 'flex', gap: 1.25, textAlign: 'left', opacity: 0.76 }}>
              <Box sx={{ width: 30, display: 'grid', placeItems: 'center' }}>
                <ListeningIcon sx={{ color: 'info.main', animation: 'blink 1.4s ease-in-out infinite' }} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 700 }}>
                  {interim.speaker?.name || 'Participant'} · {contributorStatus === 'error' ? 'provider issue' : 'listening'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{interim.text}</Typography>
              </Box>
            </Box>
          ))}
        </Stack>
        <div ref={bottomRef} />
      </Box>
    </Box>
  );
}

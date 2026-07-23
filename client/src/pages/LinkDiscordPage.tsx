import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  ErrorOutlineRounded as ErrorOutlineIcon,
} from '@mui/icons-material';
import type { AxiosError } from 'axios';
import BrandMark from '../components/BrandMark';
import { linkDiscord } from '../api/discord';

// Confirmation page for the Discord `/meet link` flow. The bot DMs the user a
// URL to this page carrying a single-purpose `?token=`; because this route sits
// behind ProtectedRoute, the user is already signed in (or gets bounced through
// the normal auth flow and returned here). We exchange the token for a persisted
// Discord↔account mapping and report the outcome.
type Status = 'linking' | 'linked' | 'invalid' | 'no-token';

export default function LinkDiscordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'linking' : 'no-token');
  // Guard against the effect firing twice (StrictMode / re-render) and double-posting.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;
    linkDiscord(token)
      .then(() => setStatus('linked'))
      .catch((err: AxiosError) => {
        // A 400 is the expected "expired/invalid token" case; anything else is
        // treated the same for the user — the remedy is to re-run /meet link.
        void err;
        setStatus('invalid');
      });
  }, [token]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box component="header" sx={{ px: { xs: 2, sm: 4 }, py: 2 }}>
        <BrandMark />
      </Box>

      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 3, py: 6 }}>
        <Paper
          variant="outlined"
          sx={{ p: { xs: 3, sm: 5 }, maxWidth: 460, width: '100%', textAlign: 'center', borderRadius: 3, borderColor: 'divider' }}
        >
          <LinkStatus status={status} />
        </Paper>
      </Box>
    </Box>
  );
}

function LinkStatus({ status }: { status: Status }) {
  if (status === 'linking') {
    return (
      <Stack spacing={3} sx={{ alignItems: 'center' }}>
        <CircularProgress />
        <Typography variant="h6">Linking your Discord account…</Typography>
      </Stack>
    );
  }

  if (status === 'linked') {
    return (
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <CheckCircleIcon sx={{ color: 'success.main', fontSize: 56 }} />
        <Typography variant="h5">Discord linked</Typography>
        <Typography variant="body1" color="text.secondary">
          Your Discord account is now linked to A-Meet. Head back to Discord and run{' '}
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>/meet create</Box>{' '}
          to start a meeting.
        </Typography>
      </Stack>
    );
  }

  // 'invalid' and 'no-token' share a layout; only the message differs.
  const message =
    status === 'no-token'
      ? 'This link is missing its token. Run /meet link in Discord to get a fresh link.'
      : 'This link is invalid or has expired. Run /meet link in Discord to get a fresh link.';

  return (
    <Stack spacing={2} sx={{ alignItems: 'center' }}>
      <ErrorOutlineIcon sx={{ color: 'error.main', fontSize: 56 }} />
      <Typography variant="h5">Couldn’t link Discord</Typography>
      <Typography variant="body1" color="text.secondary">{message}</Typography>
      <Button variant="contained" href="/" sx={{ borderRadius: 999, px: 4, py: 1.25 }}>
        Return to home screen
      </Button>
    </Stack>
  );
}

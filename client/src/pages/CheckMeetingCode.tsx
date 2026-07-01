import { useNavigate } from 'react-router-dom';
import { Box, Button, Link, Paper, Stack, Typography } from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import BrandMark from '../components/BrandMark';

// Shown when a meeting code in the URL doesn't match an active room
// (mirrors Google Meet's "Check your meeting code" screen). With `ended`, it
// instead explains that the host ended the meeting (HTTP 410 from the API).
export default function CheckMeetingCode({ ended = false }: { ended?: boolean }) {
  const navigate = useNavigate();

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
        <Stack spacing={4} sx={{ alignItems: 'center', maxWidth: 560, width: '100%', textAlign: 'center' }}>
          <Typography variant="h3" sx={{ fontSize: { xs: 30, sm: 44 } }}>
            {ended ? 'This meeting has ended' : 'Check your meeting code'}
          </Typography>

          {ended ? (
            <Typography variant="body1" color="text.secondary">
              The host ended this meeting. Start a new meeting from the home screen, or join another
              with its code.
            </Typography>
          ) : (
            <Typography variant="body1" color="text.secondary">
              Make sure you entered the correct meeting code in the URL, for example:{' '}
              <Box component="span" sx={{ color: 'text.primary' }}>
                ameet.raja-dev.me/<strong>xxx-yyyy-zzz</strong>
              </Box>
            </Typography>
          )}

          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/')}
            sx={{ borderRadius: 999, px: 4, py: 1.25 }}
          >
            Return to home screen
          </Button>

          {/* "Your meeting is safe" reassurance card */}
          <Paper
            variant="outlined"
            sx={{ mt: 2, p: 2.5, width: '100%', maxWidth: 420, textAlign: 'left', borderRadius: 3, borderColor: 'divider' }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
              <SecurityIcon sx={{ color: 'primary.main', fontSize: 40, flexShrink: 0 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Your meeting is safe
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  No one can join a meeting unless invited or admitted by the host
                </Typography>
                <Link component="button" type="button" underline="hover" sx={{ mt: 1, display: 'inline-block' }}>
                  Learn more
                </Link>
              </Box>
            </Stack>
          </Paper>
        </Stack>
      </Box>
    </Box>
  );
}

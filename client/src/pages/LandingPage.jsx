import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar, Box, Button, Stack, TextField, Typography,
} from '@mui/material';
import {
  Google as GoogleIcon,
  VideoCall as VideoCallIcon,
  Keyboard as KeyboardIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import BrandMark from '../components/BrandMark';

export default function LandingPage() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleNewMeeting() {
    setCreating(true);
    try {
      const { data } = await api.post('/rooms');
      navigate(`/lobby/${data.roomId}`);
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(e) {
    e.preventDefault();
    let code = joinCode.trim();
    if (!code) return;
    // Tolerate a pasted full URL/path — keep only the last path segment.
    if (code.includes('/')) code = code.split('/').filter(Boolean).pop();
    if (code) navigate(`/lobby/${encodeURIComponent(code)}`);
  }

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
      {/* Header */}
      <Box component="header" sx={{ px: { xs: 2, sm: 4 }, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <BrandMark />
        {user && (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <Avatar src={user.avatar} alt={user.name} sx={{ width: 36, height: 36 }} />
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user.name}
            </Typography>
            <Button size="small" onClick={logout} color="inherit" sx={{ color: 'text.secondary' }}>
              Sign out
            </Button>
          </Stack>
        )}
      </Box>

      {/* Main */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 5, md: 8 },
          px: { xs: 3, sm: 6 },
          py: { xs: 4, md: 6 },
          maxWidth: 1240,
          width: '100%',
          mx: 'auto',
        }}
      >
        {/* Copy + actions */}
        <Stack spacing={3.5} sx={{ flex: 1, maxWidth: 560, textAlign: { xs: 'center', md: 'left' }, alignItems: { xs: 'center', md: 'flex-start' } }}>
          <Box>
            <Typography
              variant="h2"
              sx={{ fontSize: { xs: 34, sm: 46, md: 54 }, lineHeight: 1.1 }}
            >
              Video calls and meetings for{' '}
              <Box component="span" sx={{ background: (t) => t.palette.brand.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                everyone
              </Box>
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mt: 2, fontWeight: 400, fontFamily: 'Roboto, sans-serif' }}>
              Connect, collaborate, and celebrate from anywhere with A-Meet.
            </Typography>
          </Box>

          {!user ? (
            <Button
              variant="contained"
              size="large"
              startIcon={<GoogleIcon />}
              onClick={login}
              sx={{ px: 4, py: 1.5, borderRadius: 999, fontSize: 16 }}
            >
              Sign in with Google
            </Button>
          ) : (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: '100%', maxWidth: 520, alignItems: { sm: 'center' } }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<VideoCallIcon />}
                onClick={handleNewMeeting}
                disabled={creating}
                sx={{ borderRadius: 999, py: 1.5, px: 3, flexShrink: 0 }}
              >
                {creating ? 'Creating…' : 'New meeting'}
              </Button>

              <Box component="form" onSubmit={handleJoin} sx={{ display: 'flex', gap: 1, flex: 1, width: '100%' }}>
                <TextField
                  fullWidth
                  placeholder="Enter a code or link"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  autoComplete="off"
                  slotProps={{
                    input: {
                      startAdornment: <KeyboardIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                      sx: { borderRadius: 999 },
                    },
                  }}
                />
                <Button type="submit" disabled={!joinCode.trim()} sx={{ flexShrink: 0, px: 2 }}>
                  Join
                </Button>
              </Box>
            </Stack>
          )}

          <Typography variant="caption" color="text.disabled" sx={{ maxWidth: 460 }}>
            Secure by design — no one can join a meeting unless invited or admitted by the host.
          </Typography>
        </Stack>

        {/* Decorative hero — md+ only */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, flex: 1, justifyContent: 'center', maxWidth: 480 }}>
          <Box
            sx={{
              position: 'relative',
              width: 'min(100%, 420px)',
              aspectRatio: '1',
              borderRadius: '50%',
              background: (t) => t.palette.brand.gradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 24px 80px rgba(138,180,248,0.25)',
            }}
          >
            {/* Glass meeting card */}
            <Box
              sx={{
                width: '64%',
                aspectRatio: '4/3',
                borderRadius: 5,
                bgcolor: 'rgba(32,33,36,0.55)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.25)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1.5,
                p: 2,
              }}
            >
              {['#1a73e8', '#1e8e3e', '#e37400', '#9334e6'].map((c, i) => (
                <Box key={i} sx={{ borderRadius: 2, bgcolor: c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Avatar sx={{ width: 30, height: 30, bgcolor: 'rgba(0,0,0,0.25)' }} />
                </Box>
              ))}
            </Box>
            {/* Floating accent dots */}
            <Box sx={{ position: 'absolute', top: '12%', right: '8%', width: 36, height: 36, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <VideoCallIcon sx={{ color: '#1a73e8', fontSize: 22 }} />
            </Box>
            <Box sx={{ position: 'absolute', bottom: '10%', left: '6%', width: 24, height: 24, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.7)' }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Container, InputAdornment, Stack, TextField, Typography, Avatar,
} from '@mui/material';
import { Google as GoogleIcon, VideoCall as VideoCallIcon } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function LandingPage() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleNewMeeting() {
    setCreating(true);
    try {
      const { data } = await api.post('/rooms');
      navigate(`/room/${data.roomId}`);
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(e) {
    e.preventDefault();
    const code = joinCode.trim();
    if (code) navigate(`/room/${code}`);
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box component="header" sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight={700} color="primary">
          A-Meet
        </Typography>
        {user && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar src={user.avatar} alt={user.name} sx={{ width: 34, height: 34 }} />
            <Typography variant="body2" color="text.secondary">{user.name}</Typography>
            <Button size="small" onClick={logout} color="inherit">Sign out</Button>
          </Stack>
        )}
      </Box>

      {/* Main */}
      <Container maxWidth="sm" sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Stack spacing={4} alignItems="center" sx={{ width: '100%' }}>
          <Stack spacing={1} alignItems="center">
            <Typography variant="h4" fontWeight={700}>
              Video calls for everyone
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Connect, collaborate, and celebrate — anywhere
            </Typography>
          </Stack>

          {!user ? (
            <Button
              variant="contained"
              size="large"
              startIcon={<GoogleIcon />}
              onClick={login}
              sx={{ px: 4, py: 1.5, borderRadius: 99 }}
            >
              Sign in with Google
            </Button>
          ) : (
            <Stack spacing={2} sx={{ width: '100%' }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<VideoCallIcon />}
                onClick={handleNewMeeting}
                disabled={creating}
                sx={{ borderRadius: 99, py: 1.5 }}
              >
                {creating ? 'Creating…' : 'New Meeting'}
              </Button>

              <Box component="form" onSubmit={handleJoin}>
                <TextField
                  fullWidth
                  placeholder="Enter a code (e.g. abc-defg-hij)"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Button type="submit" disabled={!joinCode.trim()}>
                          Join
                        </Button>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            </Stack>
          )}
        </Stack>
      </Container>
    </Box>
  );
}

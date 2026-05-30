import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Avatar, Box, Button, FormControl, IconButton,
  InputLabel, MenuItem, Select, Stack, Tooltip, Typography,
} from '@mui/material';
import {
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useLobbyMedia } from '../hooks/useLobbyMedia';
import VideoTile from '../components/VideoTile';
import BrandMark from '../components/BrandMark';
import { playSound } from '../services/sounds';

// Round preview toggle (mic / cam) overlaid on the lobby preview tile.
function PreviewToggle({ title, on, onClick, OnIcon, OffIcon, disabled }) {
  const btn = (
    <IconButton
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: 52, height: 52,
        bgcolor: on ? 'rgba(255,255,255,0.16)' : 'error.main',
        color: '#fff',
        backdropFilter: 'blur(4px)',
        '&:hover': { bgcolor: on ? 'rgba(255,255,255,0.26)' : 'error.dark' },
        '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' },
      }}
    >
      {on ? <OnIcon /> : <OffIcon />}
    </IconButton>
  );
  return <Tooltip title={title}>{disabled ? <span>{btn}</span> : btn}</Tooltip>;
}

export default function LobbyPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    previewStream, videoDevices, audioDevices, selectedVideoId, selectedAudioId,
    videoOn, audioOn, setVideoDevice, setAudioDevice, toggleVideo, toggleAudio, stop,
  } = useLobbyMedia();

  useEffect(() => () => stop(), [stop]);

  function handleJoin() {
    stop();
    navigate(`/room/${roomId}`, {
      state: {
        videoDeviceId: selectedVideoId,
        audioDeviceId: selectedAudioId,
        startVideoOn: videoOn,
        startAudioOn: audioOn,
      },
    });
  }

  const onToggleVideo = () => { playSound(videoOn ? 'toggleOff' : 'toggleOn'); toggleVideo(); };
  const onToggleAudio = () => { playSound(audioOn ? 'toggleOff' : 'toggleOn'); toggleAudio(); };

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
      <Box component="header" sx={{ px: { xs: 2, sm: 3 }, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <BrandMark />
        {user && (
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user.name}
            </Typography>
            <Avatar src={user.avatar} alt={user.name} sx={{ width: 34, height: 34 }} />
          </Stack>
        )}
      </Box>

      {/* Body */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 3, md: 7 },
          px: { xs: 2, sm: 4 },
          py: 4,
        }}
      >
        {/* Preview */}
        <Box sx={{ width: '100%', maxWidth: 640 }}>
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              borderRadius: 4,
              overflow: 'hidden',
              boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            }}
          >
            <VideoTile
              stream={previewStream}
              muted
              name={user?.name}
              avatar={user?.avatar}
              videoOn={videoOn}
              audioOn={audioOn}
              mirror
            />
            {!videoOn && (
              <Typography
                variant="body2"
                sx={{ position: 'absolute', top: 16, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
              >
                Camera is off
              </Typography>
            )}
            {/* Overlaid toggles */}
            <Stack
              direction="row"
              spacing={2}
              sx={{ position: 'absolute', bottom: 16, left: 0, right: 0, justifyContent: 'center' }}
            >
              <PreviewToggle
                title={audioOn ? 'Turn off microphone' : 'Turn on microphone'}
                on={audioOn} onClick={onToggleAudio} OnIcon={MicIcon} OffIcon={MicOffIcon}
                disabled={audioDevices.length === 0}
              />
              <PreviewToggle
                title={videoOn ? 'Turn off camera' : 'Turn on camera'}
                on={videoOn} onClick={onToggleVideo} OnIcon={VideocamIcon} OffIcon={VideocamOffIcon}
                disabled={videoDevices.length === 0}
              />
            </Stack>
          </Box>

          {/* Device selectors */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="cam-label">Camera</InputLabel>
              <Select
                labelId="cam-label" value={selectedVideoId} label="Camera"
                onChange={(e) => setVideoDevice(e.target.value)}
                disabled={videoDevices.length === 0}
                sx={{ borderRadius: 2 }}
              >
                {videoDevices.length === 0 ? (
                  <MenuItem value="">No camera found</MenuItem>
                ) : (
                  videoDevices.map((d) => (
                    <MenuItem key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 6)}`}</MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel id="mic-label">Microphone</InputLabel>
              <Select
                labelId="mic-label" value={selectedAudioId} label="Microphone"
                onChange={(e) => setAudioDevice(e.target.value)}
                disabled={audioDevices.length === 0}
                sx={{ borderRadius: 2 }}
              >
                {audioDevices.length === 0 ? (
                  <MenuItem value="">No microphone found</MenuItem>
                ) : (
                  audioDevices.map((d) => (
                    <MenuItem key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 6)}`}</MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
          </Stack>
        </Box>

        {/* Join panel */}
        <Stack spacing={2.5} sx={{ width: { xs: '100%', md: 340 }, maxWidth: 420, alignItems: { xs: 'stretch', md: 'flex-start' }, textAlign: { xs: 'center', md: 'left' } }}>
          <Box>
            <Typography variant="h4" sx={{ fontFamily: '"Outfit", sans-serif', fontWeight: 600 }}>
              Ready to join?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Set up your camera and mic, then join the call.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: { xs: 'center', md: 'flex-start' } }}>
            <Typography variant="caption" color="text.secondary">Meeting code</Typography>
            <Box component="code" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.06)', fontFamily: 'monospace', fontSize: 13 }}>
              {roomId}
            </Box>
          </Box>

          <Button
            variant="contained"
            size="large"
            onClick={handleJoin}
            sx={{ borderRadius: 999, py: 1.5, px: 5, fontSize: 16, alignSelf: { xs: 'stretch', md: 'flex-start' } }}
          >
            Join now
          </Button>

          <Button onClick={() => navigate('/')} color="inherit" sx={{ color: 'text.secondary', alignSelf: { xs: 'center', md: 'flex-start' } }}>
            Return to home
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

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

export default function LobbyPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    previewStream,
    videoDevices,
    audioDevices,
    selectedVideoId,
    selectedAudioId,
    videoOn,
    audioOn,
    setVideoDevice,
    setAudioDevice,
    toggleVideo,
    toggleAudio,
    stop,
  } = useLobbyMedia();

  // Stop preview tracks when navigating away without joining.
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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight={700} color="primary">
          A-Meet
        </Typography>
        {user && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar src={user.avatar} alt={user.name} sx={{ width: 32, height: 32 }} />
            <Typography variant="body2" color="text.secondary">{user.name}</Typography>
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
          px: 3,
          py: 4,
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {/* Preview tile */}
        <Box sx={{ width: { xs: '100%', md: 480 }, height: 270, flexShrink: 0 }}>
          <VideoTile
            stream={previewStream}
            muted
            name={user?.name}
            avatar={user?.avatar}
            videoOn={videoOn}
            audioOn={audioOn}
          />
        </Box>

        {/* Controls */}
        <Stack spacing={3} sx={{ width: { xs: '100%', md: 320 } }}>
          <Box>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Ready to join?
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Room: {roomId}
            </Typography>
          </Box>

          {/* Camera selector */}
          <FormControl fullWidth size="small">
            <InputLabel id="cam-label">Camera</InputLabel>
            <Select
              labelId="cam-label"
              value={selectedVideoId}
              label="Camera"
              onChange={(e) => setVideoDevice(e.target.value)}
              disabled={videoDevices.length === 0}
            >
              {videoDevices.length === 0 ? (
                <MenuItem value="">No camera found</MenuItem>
              ) : (
                videoDevices.map((d) => (
                  <MenuItem key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          {/* Mic selector */}
          <FormControl fullWidth size="small">
            <InputLabel id="mic-label">Microphone</InputLabel>
            <Select
              labelId="mic-label"
              value={selectedAudioId}
              label="Microphone"
              onChange={(e) => setAudioDevice(e.target.value)}
              disabled={audioDevices.length === 0}
            >
              {audioDevices.length === 0 ? (
                <MenuItem value="">No microphone found</MenuItem>
              ) : (
                audioDevices.map((d) => (
                  <MenuItem key={d.deviceId} value={d.deviceId}>
                    {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          {/* Cam / mic toggles */}
          <Stack direction="row" spacing={1}>
            <Tooltip title={audioOn ? 'Mute microphone' : 'Unmute microphone'}>
              <span>
                <IconButton
                  onClick={toggleAudio}
                  disabled={audioDevices.length === 0}
                  sx={{
                    bgcolor: audioOn ? 'action.hover' : 'error.main',
                    color: audioOn ? 'text.primary' : 'error.contrastText',
                    '&:hover': { bgcolor: audioOn ? 'action.selected' : 'error.dark' },
                  }}
                >
                  {audioOn ? <MicIcon /> : <MicOffIcon />}
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title={videoOn ? 'Turn off camera' : 'Turn on camera'}>
              <span>
                <IconButton
                  onClick={toggleVideo}
                  disabled={videoDevices.length === 0}
                  sx={{
                    bgcolor: videoOn ? 'action.hover' : 'error.main',
                    color: videoOn ? 'text.primary' : 'error.contrastText',
                    '&:hover': { bgcolor: videoOn ? 'action.selected' : 'error.dark' },
                  }}
                >
                  {videoOn ? <VideocamIcon /> : <VideocamOffIcon />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          <Button
            variant="contained"
            size="large"
            onClick={handleJoin}
            sx={{ borderRadius: 99, py: 1.5 }}
          >
            Join now
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

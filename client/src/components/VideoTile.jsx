import { useEffect, useRef } from 'react';
import { Avatar, Box, Chip, Typography } from '@mui/material';
import { MicOff as MicOffIcon } from '@mui/icons-material';

// A single video tile. A MediaStream can't be passed as a normal `src`; it has
// to be assigned imperatively to the element's `srcObject`, so we use a ref.
// The local tile is always `muted` to avoid hearing your own mic (echo).
//
// When `videoOn` is false (camera off, or never available) we keep the <video>
// element mounted — it still carries the peer's audio — and lay a placeholder
// avatar over it, like Google Meet. A mic-off badge shows when `audioOn` is false.
const CONNECTION_BADGE = {
  connecting: { label: 'Connecting…', color: 'warning' },
  disconnected: { label: 'Reconnecting…', color: 'warning' },
  failed: { label: 'Connection failed', color: 'error' },
};

export default function VideoTile({
  stream,
  muted = false,
  name,
  avatar,
  videoOn = true,
  audioOn = true,
  connectionState,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream) el.srcObject = stream;
  }, [stream]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        bgcolor: '#202124',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          // Hide (don't unmount) the element when video is off, so audio keeps flowing.
          visibility: videoOn ? 'visible' : 'hidden',
        }}
      />

      {!videoOn && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Avatar src={avatar} alt={name} sx={{ width: 88, height: 88, fontSize: 36 }}>
            {name?.[0]}
          </Avatar>
        </Box>
      )}

      <Box
        sx={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: 'rgba(0,0,0,0.55)',
          color: 'common.white',
        }}
      >
        {!audioOn && <MicOffIcon sx={{ fontSize: 14 }} />}
        {name && <Typography variant="caption">{name}</Typography>}
      </Box>

      {CONNECTION_BADGE[connectionState] && (
        <Box sx={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }}>
          <Chip
            label={CONNECTION_BADGE[connectionState].label}
            color={CONNECTION_BADGE[connectionState].color}
            size="small"
            sx={{ fontSize: 11 }}
          />
        </Box>
      )}
    </Box>
  );
}

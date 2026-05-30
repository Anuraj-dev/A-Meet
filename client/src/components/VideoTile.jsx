import { useEffect, useRef } from 'react';
import { Avatar, Box, Chip, Typography } from '@mui/material';
import { MicOff as MicOffIcon, PanTool as PanToolIcon } from '@mui/icons-material';

const CONNECTION_BADGE = {
  connecting: { label: 'Connecting…', color: 'warning' },
  disconnected: { label: 'Reconnecting…', color: 'warning' },
  failed: { label: 'Connection failed', color: 'error' },
};

// Deterministic per-participant background color when camera is off.
const PEER_COLORS = [
  '#1a73e8', '#34a853', '#ea4335', '#fbbc04',
  '#673ab7', '#e91e63', '#00bcd4', '#ff5722',
];

function getPeerColor(name) {
  if (!name) return PEER_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

export default function VideoTile({
  stream,
  muted = false,
  name,
  avatar,
  videoOn = true,
  audioOn = true,
  connectionState,
  handRaised = false,
  activeReaction = null,
  activeSpeaker = false,
  objectFit = 'cover',
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
        bgcolor: videoOn ? '#202124' : getPeerColor(name),
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: activeSpeaker ? '0 0 0 3px #00c853' : 'none',
        transition: 'box-shadow 0.3s ease',
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
          objectFit,
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
          <Avatar src={avatar} alt={name} sx={{ width: 88, height: 88, fontSize: 36, bgcolor: 'rgba(0,0,0,0.25)' }}>
            {name?.[0]}
          </Avatar>
        </Box>
      )}

      {/* Name + mic-off label */}
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

      {/* Connection badge */}
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

      {/* Raise-hand badge */}
      {handRaised && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            bgcolor: 'rgba(0,0,0,0.6)',
            borderRadius: 1,
            px: 0.75,
            py: 0.25,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <PanToolIcon sx={{ fontSize: 14, color: 'warning.light' }} />
        </Box>
      )}

      {/* Emoji reaction overlay */}
      {activeReaction && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Typography sx={{ fontSize: 52, lineHeight: 1, userSelect: 'none' }}>
            {activeReaction}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

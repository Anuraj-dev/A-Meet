import { useEffect, useRef } from 'react';
import { Avatar, Box, Chip, Typography } from '@mui/material';
import { MicOff as MicOffIcon } from '@mui/icons-material';
import { getPeerColor } from '../utils/peer-color';

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
  handRaised = false,
  activeReaction = null,
  activeSpeaker = false,
  objectFit = 'cover',
  mirror = false,
}) {
  const videoRef = useRef(null);
  const offColor = getPeerColor(name);
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';

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
        // `size` container so children can scale with `cqmin` at any tile size.
        containerType: 'size',
        bgcolor: videoOn ? 'tile.bg' : offColor,
        borderRadius: 'inherit',
        overflow: 'hidden',
        transition: 'box-shadow 0.25s ease',
        animation: activeSpeaker ? 'ameet-speaker-pulse 1.6s ease-in-out infinite' : 'none',
        // Subtle inset hairline gives every tile crisp definition on the canvas.
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          pointerEvents: 'none',
        },
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
          display: 'block',
          visibility: videoOn ? 'visible' : 'hidden',
          // Mirror the local self-view (selfie style) like Meet; never remote.
          transform: mirror ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* Off-camera state: the person's photo blurred into an ambient backdrop
          (Meet-style), with their crisp avatar centred on top. Falls back to the
          flat peer color when there's no avatar. */}
      {!videoOn && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {avatar && (
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url("${avatar}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                // Blow the photo up so the blur never reveals tile edges.
                transform: 'scale(1.4)',
                filter: 'blur(36px) saturate(1.25)',
              }}
            />
          )}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: avatar
                ? 'radial-gradient(circle at 50% 42%, rgba(0,0,0,0.15), rgba(0,0,0,0.6) 84%)'
                : 'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.14), rgba(0,0,0,0.22) 72%)',
            }}
          />
          <Avatar
            src={avatar}
            alt={name}
            sx={{
              position: 'relative',
              zIndex: 1,
              width: 'min(40cqmin, 132px)',
              height: 'min(40cqmin, 132px)',
              fontSize: 'min(18cqmin, 52px)',
              fontWeight: 600,
              color: '#fff',
              bgcolor: 'rgba(0,0,0,0.35)',
              boxShadow: '0 2px 18px rgba(0,0,0,0.45)',
            }}
          >
            {initial}
          </Avatar>
        </Box>
      )}

      {/* Bottom scrim for label legibility over video */}
      {videoOn && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 28%)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Name label (bottom-left) */}
      {name && (
        <Box
          sx={{
            position: 'absolute',
            left: 'clamp(8px, 3cqmin, 14px)',
            bottom: 'clamp(8px, 3cqmin, 14px)',
            right: 'clamp(8px, 3cqmin, 14px)',
            display: 'flex',
            alignItems: 'center',
            minWidth: 0,
          }}
        >
          <Typography
            noWrap
            sx={{
              fontSize: 'clamp(11px, 3.4cqmin, 14px)',
              fontWeight: 500,
              color: '#fff',
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}
          >
            {name}
          </Typography>
        </Box>
      )}

      {/* Muted indicator (top-right) — matches Meet's corner placement */}
      {!audioOn && (
        <Box
          sx={{
            position: 'absolute',
            top: 'clamp(8px, 3cqmin, 14px)',
            right: 'clamp(8px, 3cqmin, 14px)',
            width: 'clamp(24px, 7.5cqmin, 32px)',
            height: 'clamp(24px, 7.5cqmin, 32px)',
            borderRadius: '50%',
            bgcolor: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
          }}
        >
          <MicOffIcon sx={{ fontSize: 'clamp(13px, 4.4cqmin, 18px)', color: '#fff' }} />
        </Box>
      )}

      {/* Raise-hand badge (top-left) */}
      {handRaised && (
        <Box
          sx={{
            position: 'absolute',
            top: 'clamp(8px, 3cqmin, 14px)',
            left: 'clamp(8px, 3cqmin, 14px)',
            width: 'clamp(28px, 9cqmin, 38px)',
            height: 'clamp(28px, 9cqmin, 38px)',
            borderRadius: '50%',
            bgcolor: 'warning.main',
            color: 'warning.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            animation: 'ameet-pop-in 0.25s ease-out',
          }}
        >
          <Box
            component="span"
            sx={{
              fontSize: 'clamp(14px, 5cqmin, 20px)',
              lineHeight: 1,
              transformOrigin: '70% 90%',
              animation: 'ameet-hand-wave 0.9s ease-in-out 2',
            }}
          >
            ✋
          </Box>
        </Box>
      )}

      {/* Connection badge (top-center) */}
      {CONNECTION_BADGE[connectionState] && (
        <Box sx={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)' }}>
          <Chip
            label={CONNECTION_BADGE[connectionState].label}
            color={CONNECTION_BADGE[connectionState].color}
            size="small"
            sx={{ fontSize: 11, height: 24 }}
          />
        </Box>
      )}

      {/* Floating emoji reaction */}
      {activeReaction && (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '18%',
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Box
            component="span"
            // key on the emoji re-mounts the node so a new reaction replays the float.
            key={activeReaction}
            sx={{
              fontSize: 'min(26cqmin, 64px)',
              lineHeight: 1,
              userSelect: 'none',
              filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
              animation: 'ameet-reaction-float 1.6s ease-out forwards',
            }}
          >
            {activeReaction}
          </Box>
        </Box>
      )}
    </Box>
  );
}

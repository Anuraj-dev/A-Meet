import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar, Box, Chip, Divider, IconButton, ListItemIcon, ListItemText,
  MenuItem, Popover, Slider, Stack, Tooltip, Typography,
} from '@mui/material';
import {
  Fullscreen as FullscreenIcon,
  MicOff as MicOffIcon,
  MoreVert as MoreVertIcon,
  PushPin as PinIcon,
  PushPinOutlined as PinOutlineIcon,
  Stars as SpotlightIcon,
  VolumeOff as VolumeOffIcon,
  VolumeUp as VolumeUpIcon,
} from '@mui/icons-material';
import { getPeerColor } from '../utils/peer-color';
import { useAudioLevel } from '../hooks/useAudioLevel';

const CONNECTION_BADGE = {
  connecting: { label: 'Connecting…', color: 'warning' },
  disconnected: { label: 'Reconnecting…', color: 'warning' },
  failed: { label: 'Connection failed', color: 'error' },
};

export default function VideoTile({
  stream,
  audioStream,
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
  showVolumeControl = false,
  peerVolume = 1,
  onPeerVolumeChange,
  pinned = false,
  onPin,
  spotlighted = false,
  canSpotlight = false,
  onSpotlight,
}) {
  const videoRef = useRef(null);
  const rootRef = useRef(null);
  const volBtnRef = useRef(null);
  const offColor = getPeerColor(name);
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';
  const levelRef = useAudioLevel(audioStream ?? stream, audioOn);
  const [hovered, setHovered] = useState(false);
  const [volAnchor, setVolAnchor] = useState(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream) el.srcObject = stream;
  }, [stream]);

  // Root needs two refs: the analyser's `levelRef` (cascades `--lvl`) and our own
  // `rootRef` (the fullscreen target). Merge them in one stable callback so the
  // metering isn't torn down each render. `levelRef` from the hook is stable.
  const setRootRef = useCallback((node) => {
    rootRef.current = node;
    if (levelRef) levelRef.current = node;
  }, [levelRef]);

  const enterFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  // The bottom-right control button shows whenever any action is available.
  const hasMenu = showVolumeControl || Boolean(onPin) || (canSpotlight && Boolean(onSpotlight));

  return (
    <>
    <Box
      // `levelRef` lives on the root so the analyser's `--lvl` (0..1) cascades
      // to every child — the avatar ring and the tile-edge mic meter both read it.
      // `rootRef` (merged in) is the fullscreen target.
      ref={setRootRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        // `size` container so children can scale with `cqmin` at any tile size.
        containerType: 'size',
        bgcolor: videoOn ? 'tile.bg' : offColor,
        borderRadius: 'inherit',
        overflow: 'hidden',
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
          {/* Voice-reactive ring around the avatar — confirms the mic is live
              and shows speaking even with the camera off. Driven by --lvl, so it
              grows/brightens in real time with the actual audio level. */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 'min(40cqmin, 132px)',
              height: 'min(40cqmin, 132px)',
              transform: 'translate(-50%, -50%) scale(calc(1 + min(0.12, var(--lvl, 0) * 0.3)))',
              borderRadius: '50%',
              pointerEvents: 'none',
              zIndex: 0,
              // min() amplifies quiet speech (raw --lvl is modest) then clamps the
              // glow so a shout doesn't blow out the tile.
              boxShadow:
                '0 0 min(30px, calc(var(--lvl,0) * 60px)) min(16px, calc(var(--lvl,0) * 32px)) rgba(52,211,153, min(0.8, calc(var(--lvl,0) * 2)))',
              transition: 'box-shadow 0.08s linear, transform 0.08s linear',
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
              fontWeight: 700,
              color: '#fff',
              // Use the same deterministic peer color as the tile bg so the
              // circle seamlessly matches — this is how Google Meet renders
              // camera-off initials (no dark overlay, just the person's color).
              bgcolor: offColor,
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
            left: 'clamp(10px, 3.5cqmin, 16px)',
            bottom: 'clamp(10px, 3.5cqmin, 16px)',
            right: 'clamp(10px, 3.5cqmin, 16px)',
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
            top: 'clamp(10px, 3.5cqmin, 16px)',
            right: 'clamp(10px, 3.5cqmin, 16px)',
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
            top: 'clamp(10px, 3.5cqmin, 16px)',
            left: 'clamp(10px, 3.5cqmin, 16px)',
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

      {/* Real-time mic-level ring on the tile edge (camera on) — a thin green
          inset border that brightens with your voice so you can see at a glance
          that the mic is picking you up. Rendered last so it sits over the video. */}
      {videoOn && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            boxShadow:
              'inset 0 0 0 min(3px, calc(var(--lvl,0) * 9px)) rgba(52,211,153, min(0.9, calc(var(--lvl,0) * 2.4)))',
            transition: 'box-shadow 0.06s linear',
          }}
        />
      )}

      {/* Active-speaker focus ring — the SFU picks the loudest person and we
          light their whole tile green (Google-Meet style) to keep the focus
          on whoever is talking. */}
      {activeSpeaker && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 0 3px #34d399, inset 0 0 14px rgba(52,211,153,0.45)',
            animation: 'ameet-speaker-pulse 1.8s ease-in-out infinite',
          }}
        />
      )}

      {/* Pinned indicator (top-right area, left of the mute badge) */}
      {pinned && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 'clamp(10px, 3.5cqmin, 16px)',
            right: !audioOn ? 'clamp(46px, 13cqmin, 56px)' : 'clamp(10px, 3.5cqmin, 16px)',
            width: 'clamp(24px, 7.5cqmin, 32px)',
            height: 'clamp(24px, 7.5cqmin, 32px)',
            borderRadius: '50%',
            bgcolor: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
          }}
        >
          <PinIcon sx={{ fontSize: 'clamp(12px, 4cqmin, 16px)', color: 'primary.main' }} />
        </Box>
      )}

      {/* Tile options button — pin / spotlight / fullscreen (+ per-peer volume on
          remote tiles). Persistently visible (subtle when idle) rather than
          hover-only, so it's reachable on touch. */}
      {hasMenu && (
        <Box
          ref={volBtnRef}
          sx={{
            position: 'absolute',
            bottom: 'clamp(10px, 3.5cqmin, 16px)',
            right: 'clamp(10px, 3.5cqmin, 16px)',
            opacity: hovered || Boolean(volAnchor) ? 1 : 0.65,
            transition: 'opacity 0.15s, transform 0.15s',
            transform: hovered || Boolean(volAnchor) ? 'scale(1.05)' : 'scale(1)',
            zIndex: 2,
          }}
        >
          <Tooltip title={peerVolume === 0 && showVolumeControl ? `${name ?? 'Participant'} muted for you` : 'Tile options'}>
            <IconButton
              size="small"
              onClick={() => setVolAnchor(volAnchor ? null : volBtnRef.current)}
              sx={{
                width: 'clamp(28px, 8.5cqmin, 34px)',
                height: 'clamp(28px, 8.5cqmin, 34px)',
                bgcolor: volAnchor ? 'primary.main' : 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                color: '#fff',
                boxShadow: '0 1px 6px rgba(0,0,0,0.45)',
                '&:hover': { bgcolor: volAnchor ? 'primary.main' : 'rgba(0,0,0,0.8)' },
              }}
            >
              {showVolumeControl && peerVolume === 0
                ? <VolumeOffIcon sx={{ fontSize: 'clamp(14px, 5cqmin, 18px)' }} />
                : <MoreVertIcon sx={{ fontSize: 'clamp(14px, 5cqmin, 18px)' }} />}
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>

    {/* Tile options popover — MUI Portal renders outside overflow:hidden, safe
        to nest. Pin/spotlight/fullscreen rows, then the per-peer volume slider. */}
    {hasMenu && (
      <Popover
        open={Boolean(volAnchor)}
        anchorEl={volAnchor}
        onClose={() => setVolAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              mb: 1, borderRadius: 2.5, minWidth: 220, py: 0.5,
              bgcolor: 'control.surface',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
            },
          },
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', display: 'block', px: 2, pt: 1, pb: 0.5 }}>
          {name}
        </Typography>

        {onPin && (
          <MenuItem onClick={() => { onPin(); setVolAnchor(null); }}>
            <ListItemIcon>{pinned ? <PinIcon fontSize="small" /> : <PinOutlineIcon fontSize="small" />}</ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: 'body2' }}>{pinned ? 'Unpin for me' : 'Pin for me'}</ListItemText>
          </MenuItem>
        )}
        {canSpotlight && onSpotlight && (
          <MenuItem onClick={() => { onSpotlight(); setVolAnchor(null); }}>
            <ListItemIcon><SpotlightIcon fontSize="small" sx={{ color: spotlighted ? 'primary.main' : undefined }} /></ListItemIcon>
            <ListItemText primaryTypographyProps={{ variant: 'body2' }}>{spotlighted ? 'Remove spotlight' : 'Spotlight for everyone'}</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { enterFullscreen(); setVolAnchor(null); }}>
          <ListItemIcon><FullscreenIcon fontSize="small" /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: 'body2' }}>Fullscreen</ListItemText>
        </MenuItem>

        {showVolumeControl && (
          <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
              Output volume
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              {peerVolume === 0
                ? <VolumeOffIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
                : <VolumeUpIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />}
              <Slider
                size="small"
                min={0} max={1} step={0.05}
                value={peerVolume}
                onChange={(_, v) => onPeerVolumeChange?.(v)}
                sx={{ color: 'primary.main' }}
              />
              <Typography variant="caption" sx={{ minWidth: 34, textAlign: 'right', color: 'text.secondary' }}>
                {Math.round(peerVolume * 100)}%
              </Typography>
            </Stack>
          </Box>
        )}
      </Popover>
    )}
    </>
  );
}

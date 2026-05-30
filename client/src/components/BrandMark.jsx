import { Box, Typography } from '@mui/material';
import { VideoCall as VideoCallIcon } from '@mui/icons-material';

// A-Meet wordmark — Outfit display font with the brand blue→violet gradient.
export default function BrandMark({ size = 'md' }) {
  const s = size === 'lg'
    ? { icon: 40, iconFont: 26, text: 30, radius: 12 }
    : { icon: 32, iconFont: 20, text: 22, radius: 10 };

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, userSelect: 'none' }}>
      <Box
        sx={{
          width: s.icon,
          height: s.icon,
          borderRadius: `${s.radius}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: (t) => t.palette.brand.gradient,
          color: '#202124',
          boxShadow: '0 4px 14px rgba(138,180,248,0.35)',
        }}
      >
        <VideoCallIcon sx={{ fontSize: s.iconFont }} />
      </Box>
      <Typography
        component="span"
        sx={{
          fontFamily: '"Outfit", sans-serif',
          fontWeight: 700,
          fontSize: s.text,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          background: (t) => t.palette.brand.gradient,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        A-Meet
      </Typography>
    </Box>
  );
}

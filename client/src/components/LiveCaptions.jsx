import { Avatar, Box, Typography } from '@mui/material';

export default function LiveCaptions({ entry, interim }) {
  const speaker = interim?.text ? interim.speaker : entry?.speaker;
  const text = interim?.text || entry?.text;
  if (!text) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'absolute',
        zIndex: 12,
        left: '50%',
        bottom: { xs: 92, sm: 104 },
        transform: 'translateX(-50%)',
        width: 'min(720px, calc(100% - 28px))',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        px: { xs: 1.5, sm: 2 },
        py: 1.25,
        borderRadius: '14px 14px 6px 14px',
        bgcolor: 'rgba(8,10,18,0.88)',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 14px 40px rgba(0,0,0,0.48)',
        backdropFilter: 'blur(16px)',
        pointerEvents: 'none',
      }}
    >
      <Avatar src={speaker?.avatar} alt="" sx={{ width: 28, height: 28, fontSize: 12 }}>
        {speaker?.name?.[0] || '?'}
      </Avatar>
      <Box sx={{ minWidth: 0, textAlign: 'left' }}>
        <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 700 }}>
          {speaker?.name || 'Participant'}{interim?.text ? ' · listening' : ''}
        </Typography>
        <Typography sx={{ color: '#fff', fontSize: { xs: 14, sm: 16 }, lineHeight: 1.45 }}>
          {text}
        </Typography>
      </Box>
    </Box>
  );
}

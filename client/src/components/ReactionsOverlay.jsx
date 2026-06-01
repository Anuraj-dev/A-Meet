import { Avatar, Box, Typography } from '@mui/material';

// Bottom-left floating emoji stream, Google Meet style.
// Each entry: { id, emoji, name, avatar }
export default function ReactionsOverlay({ reactions = [] }) {
  if (reactions.length === 0) return null;
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        left: { xs: 8, sm: 20 },
        bottom: { xs: 152, sm: 172 },
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 1,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {reactions.map(({ id, emoji, name, avatar }) => (
        <Box
          key={id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            animation: 'ameet-reaction-float 1.8s ease-out forwards',
          }}
        >
          <Typography sx={{ fontSize: 32, lineHeight: 1, userSelect: 'none', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}>
            {emoji}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              bgcolor: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
              borderRadius: 999,
              px: 1,
              py: 0.4,
            }}
          >
            <Avatar src={avatar} alt={name} sx={{ width: 20, height: 20, fontSize: 11 }}>
              {name?.[0]}
            </Avatar>
            <Typography variant="caption" sx={{ color: '#fff', fontWeight: 500, lineHeight: 1.2 }}>
              {name ?? 'Participant'}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

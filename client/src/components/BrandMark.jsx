import { Box, Typography } from '@mui/material';

const EASE = 'cubic-bezier(0.23,1,0.32,1)';

export default function BrandMark({ size = 'md' }) {
  const s = size === 'lg'
    ? { icon: 42, text: 22, radius: 13 }
    : { icon: 34, text: 20, radius: 11 };

  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 1.25, userSelect: 'none',
      cursor: 'default',
      '&:hover .bm-square': {
        transform: 'rotate(50deg) scale(1.1)',
        boxShadow: '0 4px 20px rgba(255,107,74,0.60)',
      },
    }}>
      <Box
        className="bm-square"
        sx={{
          width: s.icon, height: s.icon, borderRadius: `${s.radius}px`,
          background: '#ff6b4a',
          display: 'grid', placeItems: 'center',
          transform: 'rotate(-6deg)',
          flexShrink: 0,
          boxShadow: '0 2px 12px rgba(255,107,74,0.40)',
          transition: `transform 0.45s ${EASE}, box-shadow 0.45s ${EASE}`,
        }}
      >
        <Box sx={{
          width: s.icon * 0.38, height: s.icon * 0.38,
          borderRadius: '50%', bgcolor: '#fff',
        }} />
      </Box>
      <Typography
        component="span"
        sx={{
          fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
          fontWeight: 800, fontSize: s.text, lineHeight: 1,
          letterSpacing: '-0.03em', whiteSpace: 'nowrap',
          color: '#f2ede8',
        }}
      >
        A-Meet
      </Typography>
    </Box>
  );
}

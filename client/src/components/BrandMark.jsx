import { Box, Typography } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';

const EASE = 'cubic-bezier(0.23,1,0.32,1)';

export default function BrandMark({ size = 'md' }) {
  const s = size === 'lg'
    ? { box: 42, icon: 26, radius: 13, text: 22 }
    : { box: 34, icon: 21, radius: 11, text: 20 };

  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 1.25,
      userSelect: 'none', cursor: 'default',
      '&:hover .bm-icon': {
        transform: 'rotate(50deg) scale(1.1)',
        boxShadow: '0 4px 20px rgba(255,107,74,0.60)',
      },
    }}>
      <Box
        className="bm-icon"
        aria-label="A-Meet"
        sx={{
          width: s.box, height: s.box, borderRadius: `${s.radius}px`,
          background: '#ff6b4a',
          display: 'grid', placeItems: 'center',
          transform: 'rotate(-6deg)',
          flexShrink: 0,
          boxShadow: '0 2px 12px rgba(255,107,74,0.40)',
          transition: `transform 0.45s ${EASE}, box-shadow 0.45s ${EASE}`,
        }}
      >
        <VideocamRoundedIcon sx={{ fontSize: s.icon, color: '#fff' }} />
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

import { createTheme } from '@mui/material/styles';

const BRAND_GRADIENT = 'linear-gradient(120deg, #1a73e8, #9334e6)';
const GRAD_TEXT = 'linear-gradient(110deg, #5b8bff, #a855f7 60%, #00f5d4)';

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#060810',
      paper: 'rgba(255,255,255,0.045)',
    },
    primary: {
      main: '#5b8bff',
      dark: '#1a73e8',
      contrastText: '#fff',
    },
    secondary: {
      main: '#9334e6',
      light: '#a855f7',
    },
    error: {
      main: '#ef4444',
      dark: '#dc2626',
    },
    warning: {
      main: '#f5b542',
      dark: '#f97316',
      contrastText: '#060810',
    },
    success: {
      main: '#34d399',
    },
    info: {
      main: '#00f5d4',
    },
    divider: 'rgba(255,255,255,0.10)',
    text: {
      primary: '#f2f4f9',
      secondary: '#94a3b8',
      disabled: '#475569',
    },
    brand: {
      gradient: BRAND_GRADIENT,
      gradText: GRAD_TEXT,
    },
    control: {
      idle: 'rgba(255,255,255,0.07)',
      idleHover: 'rgba(255,255,255,0.12)',
      surface: 'rgba(6,8,16,0.6)',
    },
    tile: {
      bg: '#0a0d18',
    },
    glass: {
      surface: 'rgba(255,255,255,0.045)',
      surface2: 'rgba(255,255,255,0.07)',
      border: 'rgba(255,255,255,0.10)',
      border2: 'rgba(255,255,255,0.16)',
    },
  },

  typography: {
    fontFamily: '"DM Sans", system-ui, sans-serif',
    h1: { fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.04em' },
    h2: { fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.03em' },
    h3: { fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 600, letterSpacing: '-0.02em' },
    h4: { fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 600, letterSpacing: '-0.02em' },
    h5: { fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 600 },
    button: { fontFamily: '"Outfit", system-ui, sans-serif', fontWeight: 600 },
    caption: { fontFamily: '"DM Sans", system-ui, sans-serif' },
    overline: { fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.12em' },
  },

  shape: {
    borderRadius: 16,
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': { height: '100%' },
        body: {
          margin: 0,
          backgroundColor: '#060810',
          overscrollBehavior: 'none',
          WebkitFontSmoothing: 'antialiased',
          scrollbarColor: 'rgba(255,255,255,0.18) transparent',
          scrollbarWidth: 'thin',
        },
        '*::-webkit-scrollbar': { width: 6, height: 6 },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(255,255,255,0.18)',
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '@keyframes floatY': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        '@keyframes pulseRing': {
          '0%': { transform: 'scale(1)', opacity: 0.7 },
          '100%': { transform: 'scale(1.5)', opacity: 0 },
        },
        '@keyframes shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '55%, 100%': { transform: 'translateX(100%)' },
        },
        '@keyframes speakPulse': {
          '0%': { boxShadow: '0 0 0 1px #5b8bff, 0 0 0 0 rgba(91,139,255,0.5)' },
          '70%': { boxShadow: '0 0 0 2px #5b8bff, 0 0 0 14px rgba(91,139,255,0)' },
          '100%': { boxShadow: '0 0 0 1px #5b8bff, 0 0 0 0 rgba(91,139,255,0)' },
        },
        '@keyframes blink': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.3 },
        },
        '@keyframes ameet-reaction-float': {
          '0%': { opacity: 0, transform: 'translateY(28px) scale(0.4)' },
          '14%': { opacity: 1, transform: 'translateY(0) scale(1.1)' },
          '24%': { transform: 'translateY(-4px) scale(1)' },
          '72%': { opacity: 1, transform: 'translateY(-30px) scale(1)' },
          '100%': { opacity: 0, transform: 'translateY(-72px) scale(0.85)' },
        },
        '@keyframes ameet-pop-in': {
          '0%': { opacity: 0, transform: 'scale(0.8)' },
          '60%': { opacity: 1, transform: 'scale(1.04)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        '@keyframes ameet-hand-wave': {
          '0%, 100%': { transform: 'rotate(-8deg)' },
          '50%': { transform: 'rotate(10deg)' },
        },
        // Active-speaker tile ring — gently breathes the green inset glow.
        // Inset (not outer) so the grid wrapper's overflow:hidden never clips it.
        '@keyframes ameet-speaker-pulse': {
          '0%, 100%': { boxShadow: 'inset 0 0 0 3px #34d399, inset 0 0 10px rgba(52,211,153,0.30)' },
          '50%': { boxShadow: 'inset 0 0 0 3px #34d399, inset 0 0 20px rgba(52,211,153,0.65)' },
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
        },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, fontFamily: '"Outfit", system-ui, sans-serif' },
        sizeLarge: { paddingTop: 13, paddingBottom: 13 },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(6,8,16,0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.10)',
        },
      },
    },

    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 400, enterNextDelay: 200 },
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1a1d2e',
          fontSize: 12,
          fontWeight: 500,
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
        },
        arrow: { color: '#1a1d2e' },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(8,10,22,0.95)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          backdropFilter: 'blur(20px)',
        },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(8,10,22,0.95)',
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          backdropFilter: 'blur(20px)',
        },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: 'rgba(255,255,255,0.10)' },
            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.20)' },
            '&.Mui-focused fieldset': { borderColor: '#5b8bff' },
          },
        },
      },
    },

    MuiSelect: {
      styleOverrides: {
        outlined: {
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.10)' },
        },
      },
    },

    MuiChip: {
      styleOverrides: { root: { fontWeight: 500, fontFamily: '"DM Sans", sans-serif' } },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { transition: 'background-color 0.18s ease, color 0.18s ease, transform 0.18s ease' },
      },
    },
  },
});

export default theme;

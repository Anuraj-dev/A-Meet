import { createTheme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    brand: { gradient: string; gradText: string };
    control: { idle: string; idleHover: string; surface: string };
    tile: { bg: string };
    glass: { surface: string; surface2: string; border: string; border2: string };
    ember: { main: string; dark: string; soft: string };
    sage: { main: string; soft: string };
  }

  interface PaletteOptions {
    brand?: { gradient: string; gradText: string };
    control?: { idle: string; idleHover: string; surface: string };
    tile?: { bg: string };
    glass?: { surface: string; surface2: string; border: string; border2: string };
    ember?: { main: string; dark: string; soft: string };
    sage?: { main: string; soft: string };
  }
}

// Ember / smoke design system — the SAME warm graphite + ember/sage language the
// landing and lobby use (their local `DK` object). The room used to wear a cold
// blue/purple skin, so the whole visual language flipped the moment you joined a
// call (M12). These tokens unify the product end-to-end.
//
//   ember  #e8623d  → UI accent: active controls, focus rings, primary CTAs
//   sage   #7d9183  → support / secondary / "listening" cues
//   green  #34d399  → reserved purely for LIVE-VOICE feedback (speaking ring,
//                     mic-level meter) — the most legible "who's talking" signal
//                     on warm graphite, mirroring Google Meet's behavior.
const EMBER = '#e8623d';
const EMBER_DARK = '#d4502c';
const SAGE = '#7d9183';
const VOICE = '#34d399'; // live-voice green (also the keyframe glow below)

const BRAND_GRADIENT = `linear-gradient(120deg, ${EMBER}, ${EMBER_DARK})`;
const GRAD_TEXT = `linear-gradient(110deg, ${EMBER}, #f08a5d 55%, ${SAGE})`;

// Shared ember/sage design tokens for the pre-call surfaces (landing + lobby),
// which style raw elements directly rather than through the MUI palette. These
// were previously copy-pasted as a local `DK` object in each of those files;
// this is the single source the unification note above always meant. The room
// itself reads the same language via the MUI palette tokens declared below.
export const DK = {
  bg:        '#140f0c',
  surface:   'rgba(255,255,255,0.05)',
  surface2:  'rgba(255,255,255,0.09)',
  ink:       '#f4efe9',
  dim:       '#a89f97',
  faint:     '#6f675f',
  line:      'rgba(255,255,255,0.09)',
  line2:     'rgba(255,255,255,0.16)',
  ember:     '#e8623d',
  emberDark: '#d4502c',
  emberSoft: 'rgba(232,98,61,0.16)',
  sage:      '#7d9183',
  sageSoft:  'rgba(125,145,131,0.16)',
  panel:     '#1b140f',
  display:   '"Bricolage Grotesque", system-ui, sans-serif',
  font:      '"Plus Jakarta Sans", system-ui, sans-serif',
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      // Warm graphite, a touch deeper than the landing's #140f0c so video tiles
      // read crisply against it.
      default: '#0e0a08',
      paper: 'rgba(255,255,255,0.05)',
    },
    primary: {
      main: EMBER,
      dark: EMBER_DARK,
      contrastText: '#fff',
    },
    secondary: {
      main: SAGE,
      light: '#93a596',
    },
    error: {
      main: '#ef4444',
      dark: '#dc2626',
    },
    warning: {
      main: '#f5b542',
      dark: '#f97316',
      contrastText: '#1a120c',
    },
    success: {
      main: VOICE,
      dark: '#10b981',
    },
    info: {
      main: SAGE,
    },
    divider: 'rgba(255,255,255,0.10)',
    text: {
      primary: '#f4efe9',
      secondary: '#a89f97',
      disabled: '#6f675f',
    },
    brand: {
      gradient: BRAND_GRADIENT,
      gradText: GRAD_TEXT,
    },
    control: {
      idle: 'rgba(255,255,255,0.07)',
      idleHover: 'rgba(255,255,255,0.12)',
      surface: 'rgba(20,15,12,0.62)',
    },
    tile: {
      bg: '#0a0806',
    },
    glass: {
      surface: 'rgba(255,255,255,0.05)',
      surface2: 'rgba(255,255,255,0.09)',
      border: 'rgba(255,255,255,0.10)',
      border2: 'rgba(255,255,255,0.16)',
    },
    ember: {
      main: EMBER,
      dark: EMBER_DARK,
      soft: 'rgba(232,98,61,0.16)',
    },
    sage: {
      main: SAGE,
      soft: 'rgba(125,145,131,0.16)',
    },
  },

  typography: {
    // Body → Plus Jakarta Sans, display → Bricolage Grotesque: the landing/lobby pair.
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    h1: { fontFamily: '"Bricolage Grotesque", system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.04em' },
    h2: { fontFamily: '"Bricolage Grotesque", system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.03em' },
    h3: { fontFamily: '"Bricolage Grotesque", system-ui, sans-serif', fontWeight: 600, letterSpacing: '-0.02em' },
    h4: { fontFamily: '"Bricolage Grotesque", system-ui, sans-serif', fontWeight: 600, letterSpacing: '-0.02em' },
    h5: { fontFamily: '"Bricolage Grotesque", system-ui, sans-serif', fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontFamily: '"Bricolage Grotesque", system-ui, sans-serif', fontWeight: 600 },
    button: { fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 700 },
    caption: { fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' },
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
          backgroundColor: '#0e0a08',
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
        // Generic fade/rise used by chat rows, call notes, and the empty-room card.
        '@keyframes ameet-fade-in': {
          '0%': { opacity: 0, transform: 'translateY(6px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        // Ember speak pulse (UI accent variant — the live-voice ring uses the
        // green `ameet-speaker-pulse` below).
        '@keyframes speakPulse': {
          '0%': { boxShadow: `0 0 0 1px ${EMBER}, 0 0 0 0 rgba(232,98,61,0.5)` },
          '70%': { boxShadow: `0 0 0 2px ${EMBER}, 0 0 0 14px rgba(232,98,61,0)` },
          '100%': { boxShadow: `0 0 0 1px ${EMBER}, 0 0 0 0 rgba(232,98,61,0)` },
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
        // Stays GREEN: live-voice cue, deliberately distinct from the ember UI accent.
        '@keyframes ameet-speaker-pulse': {
          '0%, 100%': { boxShadow: 'inset 0 0 0 3px #34d399, inset 0 0 10px rgba(52,211,153,0.30)' },
          '50%': { boxShadow: 'inset 0 0 0 3px #34d399, inset 0 0 20px rgba(52,211,153,0.55)' },
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
        },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 700, fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' },
        sizeLarge: { paddingTop: 13, paddingBottom: 13 },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(20,15,12,0.82)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.10)',
        },
      },
    },

    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 400, enterNextDelay: 200 },
      styleOverrides: {
        tooltip: {
          backgroundColor: '#241a14',
          fontSize: 12,
          fontWeight: 500,
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
        },
        arrow: { color: '#241a14' },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(20,14,10,0.95)',
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
          backgroundColor: 'rgba(20,14,10,0.95)',
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
            '&.Mui-focused fieldset': { borderColor: EMBER },
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
      styleOverrides: { root: { fontWeight: 500, fontFamily: '"Plus Jakarta Sans", sans-serif' } },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { transition: 'background-color 0.18s ease, color 0.18s ease, transform 0.18s ease' },
      },
    },
  },
});

export default theme;

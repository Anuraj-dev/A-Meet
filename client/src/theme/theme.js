import { createTheme } from '@mui/material/styles';

// A-Meet design language — Google Meet fidelity with a custom A-Meet accent.
// Dark, full-bleed surfaces; the brand wordmark + hero use the Outfit display
// font and a blue→violet gradient that is unique to us.

const BRAND_GRADIENT = 'linear-gradient(135deg, #8ab4f8 0%, #c58af9 100%)';

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#202124', // the call canvas behind tiles (classic Meet)
      paper: '#2a2b2e', //   chat panel, menus, dialogs
    },
    primary: {
      main: '#8ab4f8', //    Meet's dark-theme blue accent
      contrastText: '#202124',
    },
    secondary: {
      main: '#c58af9', //    A-Meet violet (pairs with the brand gradient)
    },
    error: {
      main: '#ea4335', //    Google red — end-call, mic-off
      dark: '#d33426',
    },
    warning: {
      main: '#fdd663', //    raise-hand amber
      dark: '#f9ab00',
      contrastText: '#202124',
    },
    success: {
      main: '#34a853', //    active speaker green
    },
    divider: 'rgba(255,255,255,0.10)',
    text: {
      primary: '#e8eaed',
      secondary: '#9aa0a6',
      disabled: '#80868b',
    },
    // Custom semantic tokens (accessed via theme.palette.* in sx callbacks).
    brand: { gradient: BRAND_GRADIENT },
    control: {
      idle: '#3c4043', //     resting control button (Meet gray)
      idleHover: '#4a4d51',
      surface: 'rgba(32,33,36,0.72)', // frosted control-bar / pill surface
    },
    tile: {
      bg: '#3c4043', //       camera-on tile background while video loads
    },
  },

  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontFamily: '"Outfit", "Roboto", sans-serif', fontWeight: 600, letterSpacing: '-0.02em' },
    h2: { fontFamily: '"Outfit", "Roboto", sans-serif', fontWeight: 600, letterSpacing: '-0.02em' },
    h3: { fontFamily: '"Outfit", "Roboto", sans-serif', fontWeight: 600, letterSpacing: '-0.015em' },
    h4: { fontFamily: '"Outfit", "Roboto", sans-serif', fontWeight: 600, letterSpacing: '-0.01em' },
    h5: { fontFamily: '"Outfit", "Roboto", sans-serif', fontWeight: 600 },
    h6: { fontFamily: '"Outfit", "Roboto", sans-serif', fontWeight: 600 },
    button: { fontWeight: 500 },
  },

  shape: {
    borderRadius: 12,
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': {
          height: '100%',
        },
        body: {
          margin: 0,
          backgroundColor: '#202124',
          overscrollBehavior: 'none',
          // Thin, subtle scrollbars across the app (Firefox + WebKit).
          scrollbarColor: 'rgba(255,255,255,0.22) transparent',
          scrollbarWidth: 'thin',
        },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(255,255,255,0.22)',
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': {
          backgroundColor: 'rgba(255,255,255,0.32)',
        },
        // Shared animations.
        '@keyframes ameet-reaction-float': {
          '0%': { opacity: 0, transform: 'translateY(28px) scale(0.4)' },
          '14%': { opacity: 1, transform: 'translateY(0) scale(1.1)' },
          '24%': { transform: 'translateY(-4px) scale(1)' },
          '72%': { opacity: 1, transform: 'translateY(-30px) scale(1)' },
          '100%': { opacity: 0, transform: 'translateY(-72px) scale(0.85)' },
        },
        '@keyframes ameet-speaker-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 2px #34a853, 0 0 14px 0 rgba(52,168,83,0.35)' },
          '50%': { boxShadow: '0 0 0 3px #34a853, 0 0 22px 2px rgba(52,168,83,0.55)' },
        },
        '@keyframes ameet-fade-in': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
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
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500 },
        sizeLarge: { paddingTop: 12, paddingBottom: 12 },
      },
    },

    MuiPaper: {
      // Flat panels like Meet — drop MUI's elevation gradient overlay.
      styleOverrides: { root: { backgroundImage: 'none' } },
    },

    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 400, enterNextDelay: 200 },
      styleOverrides: {
        tooltip: {
          backgroundColor: '#3c4043',
          fontSize: 12,
          fontWeight: 500,
          padding: '6px 10px',
          borderRadius: 8,
        },
        arrow: { color: '#3c4043' },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: '#2a2b2e',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
        },
      },
    },

    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: '#2a2b2e',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
        },
      },
    },

    MuiChip: {
      styleOverrides: { root: { fontWeight: 500 } },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { transition: 'background-color 0.18s ease, color 0.18s ease, transform 0.12s ease' },
      },
    },
  },
});

export default theme;

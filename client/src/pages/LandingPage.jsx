import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar, Box, Button, Stack, TextField, Typography,
} from '@mui/material';
import {
  Google as GoogleIcon,
  Keyboard as KeyboardIcon,
  VideocamRounded as VideocamIcon,
  ArrowForward as ArrowIcon,
  CalendarMonthRounded as CalendarIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import BrandMark from '../components/BrandMark';
import SpaceCanvas from '../components/SpaceCanvas';
import ScheduleMeetingDialog from '../components/ScheduleMeetingDialog';
import UpcomingMeetings from '../components/UpcomingMeetings';

const DK = {
  bg:        '#0c0b12',
  surface:   'rgba(255,255,255,0.055)',
  surface2:  'rgba(255,255,255,0.09)',
  ink:       '#f2ede8',
  dim:       '#9d9590',
  faint:     '#6a6560',
  line:      'rgba(255,255,255,0.10)',
  line2:     'rgba(255,255,255,0.16)',
  coral:     '#ff6b4a',
  coralSoft: 'rgba(255,107,74,0.18)',
  coralGlow: 'rgba(255,107,74,0.40)',
  teal:      '#1fa98f',
  tealSoft:  'rgba(31,169,143,0.15)',
  tealGlow:  'rgba(31,169,143,0.40)',
  display:   '"Bricolage Grotesque", system-ui, sans-serif',
  font:      '"Plus Jakarta Sans", system-ui, sans-serif',
};

const TILE_DATA = [
  { ini: 'MC', name: 'Maya',  accent: '#ff6b4a', bg: 'rgba(255,107,74,0.14)',  border: 'rgba(255,107,74,0.30)'  },
  { ini: 'DR', name: 'Diego', accent: '#1fa98f', bg: 'rgba(31,169,143,0.14)', border: 'rgba(31,169,143,0.30)' },
  { ini: 'AB', name: 'Aïsha', accent: '#ffb627', bg: 'rgba(255,182,39,0.12)', border: 'rgba(255,182,39,0.25)' },
  { ini: 'TB', name: 'Tom',   accent: '#7b6cf6', bg: 'rgba(123,108,246,0.14)',border: 'rgba(123,108,246,0.30)'},
];

const EASE = 'cubic-bezier(0.23,1,0.32,1)';

export default function LandingPage() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [mounted,  setMounted]  = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [meetingsKey, setMeetingsKey] = useState(0);
  const tileRefs = useRef([]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function handleNewMeeting() {
    setCreating(true);
    try {
      const { data } = await api.post('/rooms');
      navigate(`/lobby/${data.roomId}`);
    } finally { setCreating(false); }
  }

  function openSchedule() {
    setEditingMeeting(null);
    setScheduleOpen(true);
  }

  function handleEditMeeting(meeting) {
    setEditingMeeting(meeting);
    setScheduleOpen(true);
  }

  function handleScheduleClose() {
    setScheduleOpen(false);
    setEditingMeeting(null);
  }

  function handleMeetingSaved() {
    setMeetingsKey((k) => k + 1); // re-fetch the Upcoming list
  }

  function handleJoin(e) {
    e.preventDefault();
    let code = joinCode.trim();
    if (!code) return;
    if (code.includes('/')) code = code.split('/').filter(Boolean).pop();
    code = code.toLowerCase().replace(/\s+/g, '');
    if (code) navigate(`/lobby/${encodeURIComponent(code)}`);
  }

  function handleTileMouseMove(e, i) {
    const el = tileRefs.current[i];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx   = (e.clientX - rect.left) / rect.width  - 0.5;
    const cy   = (e.clientY - rect.top)  / rect.height - 0.5;
    const baseRot = [-2, 1.5, 1.5, -2][i];
    const rx = (-cy * 9).toFixed(2);
    const ry = ( cx * 11).toFixed(2);
    const accent = TILE_DATA[i].accent;
    el.style.transition = 'transform 0.12s ease-out, box-shadow 0.12s ease-out';
    el.style.transform  = `perspective(800px) rotate(${baseRot}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.05)`;
    el.style.boxShadow  = `0 24px 48px -20px rgba(0,0,0,0.6), 0 0 30px -10px ${accent}55`;
  }

  function handleTileMouseLeave(i) {
    const el = tileRefs.current[i];
    if (!el) return;
    el.style.transition = `transform 0.55s ${EASE}, box-shadow 0.55s ${EASE}`;
    el.style.transform  = '';
    el.style.boxShadow  = '';
  }

  const fadeUp = (delayMs) => ({
    opacity:   mounted ? 1 : 0,
    transform: mounted ? 'translateY(0px)' : 'translateY(24px)',
    transition: `opacity 0.65s ${EASE} ${delayMs}ms, transform 0.65s ${EASE} ${delayMs}ms`,
  });

  return (
    <Box sx={{
      minHeight: '100vh', bgcolor: DK.bg,
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      '@keyframes blobDrift1': {
        '0%':   { transform: 'translate(0,0) scale(1)' },
        '100%': { transform: 'translate(20px,-24px) scale(1.07)' },
      },
      '@keyframes blobDrift2': {
        '0%':   { transform: 'translate(0,0) scale(1)' },
        '100%': { transform: 'translate(-22px,18px) scale(1.09)' },
      },
      '@keyframes blobDrift3': {
        '0%':   { transform: 'translate(0,0) scale(1)' },
        '100%': { transform: 'translate(15px,22px) scale(1.06)' },
      },
      '@keyframes huddleFloat': {
        '0%,100%': { marginTop: '0px'  },
        '50%':     { marginTop: '-8px' },
      },
      '@keyframes coralPulse': {
        '0%':   { transform: 'scale(1)',    opacity: 0.6 },
        '70%':  { transform: 'scale(1.6)',  opacity: 0   },
        '100%': { transform: 'scale(1.6)',  opacity: 0   },
      },
      '@keyframes coralGlowPulse': {
        '0%':   { boxShadow: '0 12px 40px -8px rgba(255,107,74,0.60)' },
        '50%':  { boxShadow: '0 16px 50px -8px rgba(255,107,74,0.90)' },
        '100%': { boxShadow: '0 12px 40px -8px rgba(255,107,74,0.60)' },
      },
      '@keyframes avatarPop': {
        '0%':   { transform: 'scale(0)',    opacity: 0 },
        '65%':  { transform: 'scale(1.18)', opacity: 1 },
        '100%': { transform: 'scale(1)',    opacity: 1 },
      },
    }}>

      {/* ── Three.js SpaceCanvas background ──────────────────────────────── */}
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
        <SpaceCanvas />
      </Box>

      {/* ── Glow blobs on top of canvas ───────────────────────────────────── */}
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        <Box sx={{
          position: 'absolute', width: 480, height: 480, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,107,74,0.38) 0%, transparent 70%)',
          top: '-120px', right: '10%',
          filter: 'blur(90px)',
          animation: 'blobDrift1 18s ease-in-out infinite alternate',
        }} />
        <Box sx={{
          position: 'absolute', width: 340, height: 340, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(31,169,143,0.32) 0%, transparent 70%)',
          bottom: '40px', left: '-80px',
          filter: 'blur(80px)',
          animation: 'blobDrift2 22s ease-in-out infinite alternate',
        }} />
        <Box sx={{
          position: 'absolute', width: 240, height: 240, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,182,39,0.22) 0%, transparent 70%)',
          top: '40%', right: '-50px',
          filter: 'blur(70px)',
          animation: 'blobDrift3 27s ease-in-out infinite alternate',
        }} />
      </Box>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <Box
        component="header"
        sx={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: { xs: 3, sm: 6, md: 10 },
          bgcolor: scrolled ? 'rgba(12,11,18,0.88)' : 'rgba(12,11,18,0.0)',
          backdropFilter: scrolled ? 'blur(18px) saturate(160%)' : 'blur(0px)',
          borderBottom: scrolled ? `1px solid ${DK.line}` : '1px solid transparent',
          boxShadow: scrolled ? '0 2px 24px rgba(0,0,0,0.35)' : 'none',
          transition: `background-color 0.35s ${EASE}, backdrop-filter 0.35s ${EASE}, border-color 0.35s ${EASE}, box-shadow 0.35s ${EASE}`,
        }}
      >
        <BrandMark />

        {!user ? (
          <Button
            onClick={login}
            startIcon={<GoogleIcon />}
            sx={{
              borderRadius: '999px', px: 2.5, py: 1,
              border: `1.5px solid ${DK.line2}`,
              bgcolor: DK.surface, color: DK.ink,
              fontFamily: DK.font, fontWeight: 600, fontSize: 14,
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
              '&:hover': { bgcolor: DK.surface2, borderColor: DK.coral, color: DK.coral },
              transition: `all 0.25s ${EASE}`,
            }}
          >
            Sign in
          </Button>
        ) : (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'center' }}>
            <Avatar src={user.avatar} alt={user.name} sx={{ width: 36, height: 36 }} />
            <Typography sx={{ color: DK.dim, display: { xs: 'none', sm: 'block' }, fontSize: 14, fontFamily: DK.font, fontWeight: 500, lineHeight: 1 }}>
              {user.name}
            </Typography>
            <Button
              size="small"
              onClick={logout}
              sx={{ color: DK.faint, fontFamily: DK.font, fontSize: 13, py: 0, lineHeight: 1, '&:hover': { color: DK.dim } }}
            >
              Sign out
            </Button>
          </Stack>
        )}
      </Box>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <Box sx={{
        position: 'relative', zIndex: 10,
        flex: 1, display: 'flex', flexDirection: 'column',
        maxWidth: 1280, width: '100%', mx: 'auto',
        px: { xs: 3, sm: 5, md: 8 },
        pt: '72px',
      }}>

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <Box sx={{
          flex: 1, display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) minmax(0,520px)' },
          alignItems: 'center', gap: { xs: 5, md: 7 },
          py: { xs: 8, md: 6 },
        }}>

          {/* Copy column */}
          <Stack spacing={0}>

            {/* Eyebrow */}
            <Box sx={{ ...fadeUp(60), display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.75, py: 0.85, borderRadius: '999px', mb: 3, alignSelf: 'flex-start', bgcolor: DK.tealSoft, color: DK.teal, border: '1px solid rgba(31,169,143,0.25)' }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: DK.teal, boxShadow: '0 0 6px 2px rgba(31,169,143,0.60)' }} />
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, fontFamily: DK.font, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Encrypted · Instant · Open Source
              </Typography>
            </Box>

            {/* Headline */}
            <Box sx={fadeUp(130)}>
              <Typography sx={{ fontSize: { xs: 52, sm: 66, md: 80 }, lineHeight: 0.97, fontFamily: DK.display, fontWeight: 800, letterSpacing: '-0.04em', color: DK.ink, mb: 0.5 }}>
                Video calls for
              </Typography>
            </Box>
            <Box sx={fadeUp(190)}>
              <Typography sx={{
                fontSize: { xs: 52, sm: 66, md: 80 }, lineHeight: 0.97, mb: 3.5,
                fontFamily: DK.display, fontWeight: 800, letterSpacing: '-0.04em',
                color: DK.coral,
                textShadow: '0 0 40px rgba(255,107,74,0.40)',
              }}>
                everyone.
              </Typography>
            </Box>

            {/* Subtitle */}
            <Box sx={fadeUp(250)}>
              <Typography sx={{ fontSize: 18, lineHeight: 1.55, color: DK.dim, mb: 4.5, maxWidth: 420, fontFamily: DK.font, fontWeight: 500 }}>
                The friendliest way to meet. Spin up a room, share a link, and get everyone together in seconds.
              </Typography>
            </Box>

            {/* CTA block */}
            {!user ? (
              <Box sx={{ ...fadeUp(310), mb: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<GoogleIcon />}
                    onClick={login}
                    sx={{
                      bgcolor: DK.coral, color: '#fff',
                      borderRadius: '999px', px: 3.5, py: 1.75, fontSize: 15.5, fontWeight: 700,
                      fontFamily: DK.font,
                      position: 'relative', overflow: 'hidden',
                      animation: 'coralGlowPulse 3s ease-in-out infinite',
                      '&::after': {
                        content: '""', position: 'absolute', inset: '-3px',
                        borderRadius: '999px', border: `2.5px solid ${DK.coral}`,
                        opacity: 0,
                      },
                      '&:hover': {
                        bgcolor: '#ff5235',
                        boxShadow: '0 18px 50px -8px rgba(255,107,74,0.80)',
                        animation: 'none',
                        '&::after': { animation: `coralPulse 0.65s ${EASE} forwards` },
                      },
                      transition: `background-color 0.25s ${EASE}, transform 0.25s ${EASE}`,
                    }}
                  >
                    Sign in with Google
                  </Button>
                </Stack>
              </Box>
            ) : (
              <Stack spacing={2} sx={{ mb: 4 }}>
                {/* Two pill buttons */}
                <Box sx={fadeUp(310)}>
                  <Stack direction="row" spacing={1.5} flexWrap="wrap">
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<VideocamIcon />}
                      onClick={handleNewMeeting}
                      disabled={creating}
                      sx={{
                        bgcolor: DK.coral, color: '#fff',
                        borderRadius: '999px', px: 3, py: 1.75, fontSize: 15.5, fontWeight: 700,
                        fontFamily: DK.font,
                        position: 'relative', overflow: 'hidden',
                        animation: 'coralGlowPulse 3s ease-in-out infinite',
                        '&::after': {
                          content: '""', position: 'absolute', inset: '-3px',
                          borderRadius: '999px', border: `2.5px solid ${DK.coral}`,
                          opacity: 0,
                        },
                        '&:hover': {
                          bgcolor: '#ff5235',
                          boxShadow: '0 18px 50px -8px rgba(255,107,74,0.80)',
                          transform: 'translateY(-1px)',
                          animation: 'none',
                          '&::after': { animation: `coralPulse 0.65s ${EASE} forwards` },
                        },
                        '&.Mui-disabled': { bgcolor: DK.faint, color: 'rgba(255,255,255,0.35)', animation: 'none' },
                        transition: `background-color 0.25s ${EASE}, transform 0.25s ${EASE}`,
                      }}
                    >
                      {creating ? 'Creating…' : 'New meeting'}
                    </Button>

                    <Button
                      size="large"
                      startIcon={<KeyboardIcon sx={{ color: DK.dim }} />}
                      onClick={() => setJoinOpen((v) => !v)}
                      sx={{
                        bgcolor: DK.surface, color: DK.ink,
                        borderRadius: '999px', px: 3, py: 1.75, fontSize: 15.5, fontWeight: 700,
                        fontFamily: DK.font,
                        border: `1.5px solid ${DK.line2}`,
                        backdropFilter: 'blur(8px)',
                        '&:hover': { bgcolor: DK.surface2, borderColor: DK.coral, color: DK.coral, transform: 'translateY(-1px)' },
                        transition: `border-color 0.2s ${EASE}, color 0.2s ${EASE}, background-color 0.2s ${EASE}, transform 0.2s ${EASE}`,
                      }}
                    >
                      Join with code
                    </Button>

                    <Button
                      size="large"
                      startIcon={<CalendarIcon sx={{ color: DK.dim }} />}
                      onClick={openSchedule}
                      sx={{
                        bgcolor: DK.surface, color: DK.ink,
                        borderRadius: '999px', px: 3, py: 1.75, fontSize: 15.5, fontWeight: 700,
                        fontFamily: DK.font,
                        border: `1.5px solid ${DK.line2}`,
                        backdropFilter: 'blur(8px)',
                        '&:hover': { bgcolor: DK.surface2, borderColor: DK.teal, color: DK.teal, transform: 'translateY(-1px)' },
                        transition: `border-color 0.2s ${EASE}, color 0.2s ${EASE}, background-color 0.2s ${EASE}, transform 0.2s ${EASE}`,
                      }}
                    >
                      Schedule
                    </Button>
                  </Stack>
                </Box>

                {/* Inline join form — smooth height reveal */}
                <Box sx={{
                  overflow: 'hidden',
                  maxHeight: joinOpen ? '80px' : '0px',
                  opacity:   joinOpen ? 1 : 0,
                  transition: `max-height 0.45s ${EASE}, opacity 0.35s ${EASE}`,
                }}>
                  <Box component="form" onSubmit={handleJoin} sx={{ display: 'flex', gap: 1, maxWidth: 420, pt: 0.5 }}>
                    <TextField
                      fullWidth autoFocus
                      placeholder="Enter a code or link"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      autoComplete="off"
                      size="small"
                      slotProps={{
                        input: {
                          sx: {
                            borderRadius: '999px', fontSize: 14,
                            bgcolor: DK.surface, fontFamily: DK.font, color: DK.ink,
                            '& fieldset': { borderColor: `${DK.line} !important` },
                            '&:hover fieldset': { borderColor: `${DK.line2} !important` },
                            '&.Mui-focused fieldset': { borderColor: `${DK.coral} !important` },
                            '& input::placeholder': { color: DK.faint, opacity: 1 },
                            '& input': { color: DK.ink },
                          },
                        },
                      }}
                    />
                    <Button
                      type="submit"
                      disabled={!joinCode.trim()}
                      endIcon={<ArrowIcon />}
                      sx={{
                        flexShrink: 0, px: 2.5, borderRadius: '999px',
                        bgcolor: DK.coral, color: '#fff', fontFamily: DK.font, fontWeight: 700,
                        '&:hover': { bgcolor: '#ff5235', boxShadow: '0 8px 20px rgba(255,107,74,0.50)' },
                        '&:active': { transform: 'scale(0.97)' },
                        '&.Mui-disabled': { bgcolor: DK.surface, color: DK.faint },
                        transition: `all 0.2s ${EASE}`,
                      }}
                    >
                      Join
                    </Button>
                  </Box>
                </Box>

                {/* Social proof */}
                <Box sx={fadeUp(370)}>
                  <Stack direction="row" alignItems="center" spacing={1.25}>
                    <Box sx={{ display: 'flex' }}>
                      {TILE_DATA.map((t, i) => (
                        <Box key={i} sx={{
                          width: 30, height: 30, borderRadius: '50%',
                          bgcolor: t.accent, border: `3px solid rgba(12,11,18,0.9)`,
                          ml: i ? '-9px' : 0,
                          display: 'grid', placeItems: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: DK.display,
                          zIndex: 4 - i,
                          animation: mounted ? `avatarPop 0.5s cubic-bezier(0.34,1.56,0.64,1) ${370 + i * 80}ms both` : 'none',
                        }}>
                          {t.ini.slice(0, 1)}
                        </Box>
                      ))}
                    </Box>
                    <Typography sx={{ fontSize: 14, color: DK.dim, fontFamily: DK.font, fontWeight: 600 }}>
                      Loved by 12,000 happy teams
                    </Typography>
                  </Stack>
                </Box>
              </Stack>
            )}
          </Stack>

          {/* ── Video tile grid ─────────────────────────────────────────── */}
          <Box sx={{ display: { xs: 'none', md: 'block' }, position: 'relative', py: 2, perspective: '900px', perspectiveOrigin: '50% 50%' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {TILE_DATA.map((t, i) => (
                <Box
                  key={t.ini}
                  ref={(el) => { tileRefs.current[i] = el; }}
                  onMouseMove={(e) => handleTileMouseMove(e, i)}
                  onMouseLeave={() => handleTileMouseLeave(i)}
                  sx={{
                    height: 182, borderRadius: '22px',
                    bgcolor: t.bg,
                    border: `1.5px solid ${t.border}`,
                    position: 'relative', display: 'grid', placeItems: 'center',
                    transform: `rotate(${[-2, 1.5, 1.5, -2][i]}deg)`,
                    transformOrigin: 'center center',
                    transformStyle: 'preserve-3d',
                    willChange: 'transform',
                    backdropFilter: 'blur(12px)',
                    boxShadow: `0 20px 40px -20px rgba(0,0,0,0.50)`,
                    overflow: 'hidden',
                    cursor: 'default',
                    animation: `huddleFloat ${[5.2, 6.4, 5.8, 6.8][i]}s ease-in-out infinite`,
                    animationDelay: `${[0, 0.4, 0.7, 0.2][i]}s`,
                    opacity:   mounted ? 1 : 0,
                    transition: `opacity 0.6s ${EASE} ${100 + i * 80}ms`,
                  }}
                >
                  <Box sx={{
                    width: 72, height: 72, borderRadius: '50%',
                    bgcolor: t.accent,
                    boxShadow: `0 0 24px 4px ${t.accent}55`,
                    display: 'grid', placeItems: 'center',
                    fontSize: 24, fontWeight: 800, color: '#fff',
                    fontFamily: DK.display,
                  }}>
                    {t.ini}
                  </Box>
                  <Box sx={{
                    position: 'absolute', left: 13, bottom: 13,
                    bgcolor: 'rgba(12,11,18,0.75)', px: 1.5, py: 0.5, borderRadius: '999px',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: DK.font, color: DK.ink }}>
                      {t.name}
                    </Typography>
                  </Box>
                  <Box sx={{
                    position: 'absolute', bottom: 16, right: 14,
                    width: 9, height: 9, borderRadius: '50%',
                    bgcolor: i === 2 ? 'rgba(239,68,68,0.85)' : DK.teal,
                    boxShadow: i === 2 ? '0 0 8px 2px rgba(239,68,68,0.6)' : `0 0 8px 2px ${DK.teal}99`,
                  }} />
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* ── Upcoming meetings (signed-in) ─────────────────────────────── */}
        {user && (
          <Box sx={{ ...fadeUp(430), maxWidth: 640, width: '100%', mb: { xs: 4, md: 6 } }}>
            <UpcomingMeetings refreshKey={meetingsKey} onEdit={handleEditMeeting} />
          </Box>
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <Box sx={{ borderTop: `1px solid rgba(255,255,255,0.07)`, py: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 13, color: DK.faint, fontFamily: DK.font }}>
            © 2026 A-Meet · Real-time video, reimagined
          </Typography>
          <Typography sx={{ fontSize: 13, color: DK.faint, fontFamily: DK.font }}>
            Built by{' '}
            <Box component="span" sx={{ color: DK.dim, fontWeight: 600 }}>Anuraj Jit Saikia</Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

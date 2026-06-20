import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Avatar, Box, Button, Drawer, IconButton, InputBase, Stack, Typography,
} from '@mui/material';
import {
  Google as GoogleIcon,
  KeyboardRounded as KeyboardIcon,
  VideocamRounded as VideocamIcon,
  ArrowForward as ArrowIcon,
  CalendarMonthRounded as CalendarIcon,
  CloseRounded as CloseIcon,
  EventNoteRounded as EventNoteIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import BrandMark from '../components/BrandMark';
import EtherealShadow from '../components/EtherealShadow';
import ScheduleMeetingDialog from '../components/ScheduleMeetingDialog';
import UpcomingMeetings from '../components/UpcomingMeetings';

// Warm graphite + ember + dusty sage. Smoke, not glow.
const DK = {
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
  sage:      '#7d9183',
  display:   '"Bricolage Grotesque", system-ui, sans-serif',
  font:      '"Plus Jakarta Sans", system-ui, sans-serif',
};

const EASE = [0.23, 1, 0.32, 1];

// One solid, high-contrast CTA — Google-Meet simple. No lift, no glow.
const primaryBtn = {
  height: 56, px: 4, borderRadius: '999px',
  bgcolor: DK.ember, color: '#fff',
  fontFamily: DK.font, fontWeight: 700, fontSize: 16, letterSpacing: '0.005em',
  textTransform: 'none', boxShadow: 'none', flexShrink: 0,
  '& .MuiButton-startIcon': { mr: 1 },
  '&:hover': { bgcolor: DK.emberDark, boxShadow: 'none' },
  '&:active': { bgcolor: DK.emberDark },
  '&.Mui-disabled': { bgcolor: 'rgba(232,98,61,0.4)', color: 'rgba(255,255,255,0.6)' },
};

// framer-motion entrance: a staggered rise for the hero column.
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export default function LandingPage() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [meetingsKey, setMeetingsKey] = useState(0);
  const [upcomingOpen, setUpcomingOpen] = useState(false);

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
    setMeetingsKey((k) => k + 1);
  }

  function handleJoin(e) {
    e.preventDefault();
    let code = joinCode.trim();
    if (!code) return;
    if (code.includes('/')) code = code.split('/').filter(Boolean).pop();
    code = code.toLowerCase().replace(/\s+/g, '');
    if (code) navigate(`/lobby/${encodeURIComponent(code)}`);
  }

  return (
    <Box sx={{ height: '100vh', width: '100%', bgcolor: DK.bg, position: 'relative', overflow: 'hidden' }}>

      {/* ── Ethereal ember smoke (full-bleed background) ───────────────────── */}
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <EtherealShadow
          color="rgba(232, 98, 61, 0.92)"
          animation={{ scale: 92, speed: 78 }}
          noise={{ opacity: 0.42, scale: 1.1 }}
          sizing="fill"
        />
      </Box>

      {/* Vignette + scrim — keeps the center copy legible over the smoke. */}
      <Box sx={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: [
          'radial-gradient(120% 90% at 50% 45%, transparent 0%, rgba(20,15,12,0.55) 60%, rgba(20,15,12,0.92) 100%)',
          'linear-gradient(to bottom, rgba(20,15,12,0.6) 0%, transparent 22%, transparent 70%, rgba(20,15,12,0.85) 100%)',
        ].join(', '),
      }} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box
        component="header"
        sx={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: { xs: 3, sm: 6, md: 9 },
        }}
      >
        <BrandMark />

        {!user ? (
          <Button
            onClick={() => login()}
            startIcon={<GoogleIcon />}
            sx={{
              borderRadius: '10px', px: 2.25, py: 0.9, textTransform: 'none',
              border: `1px solid ${DK.line2}`,
              bgcolor: 'rgba(20,15,12,0.5)', color: DK.ink,
              fontFamily: DK.font, fontWeight: 600, fontSize: 14, backdropFilter: 'blur(10px)',
              '&:hover': { bgcolor: DK.surface2, borderColor: DK.ember, color: DK.ember },
              transition: 'all 0.22s',
            }}
          >
            Sign in
          </Button>
        ) : (
          <Stack direction="row" spacing={{ xs: 0.75, sm: 1.5 }} sx={{ alignItems: 'center' }}>
            <Button
              size="small"
              startIcon={<EventNoteIcon />}
              onClick={() => setUpcomingOpen(true)}
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                borderRadius: '999px', px: 1.75, color: DK.dim, fontFamily: DK.font,
                fontWeight: 600, fontSize: 13.5, textTransform: 'none',
                border: `1px solid ${DK.line}`, bgcolor: 'rgba(20,15,12,0.4)', backdropFilter: 'blur(10px)',
                '&:hover': { color: DK.ink, borderColor: DK.line2, bgcolor: DK.surface2 },
              }}
            >
              Upcoming
            </Button>
            <Avatar src={user.avatar} alt={user.name} sx={{ width: 34, height: 34 }} />
            <Typography sx={{ color: DK.dim, display: { xs: 'none', sm: 'block' }, fontSize: 14, fontFamily: DK.font, fontWeight: 500 }}>
              {user.name}
            </Typography>
            <Button size="small" onClick={logout} sx={{ color: DK.faint, fontFamily: DK.font, fontSize: 13, textTransform: 'none', '&:hover': { color: DK.dim } }}>
              Sign out
            </Button>
          </Stack>
        )}
      </Box>

      {/* ── Hero (centered, single screen) ─────────────────────────────────── */}
      <Box
        component={motion.div}
        variants={container}
        initial="hidden"
        animate="show"
        sx={{
          position: 'relative', zIndex: 10,
          height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          px: { xs: 3, sm: 6 }, py: { xs: '88px', md: '72px' },
          maxWidth: 920, mx: 'auto',
        }}
      >
        {/* Eyebrow */}
        <Box component={motion.div} variants={item} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <Box sx={{ width: 22, height: 1.5, bgcolor: DK.ember }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, fontFamily: DK.font, letterSpacing: '0.16em', textTransform: 'uppercase', color: DK.sage }}>
            Open-source video meetings
          </Typography>
          <Box sx={{ width: 22, height: 1.5, bgcolor: DK.ember }} />
        </Box>

        {/* Headline — gradient ink, ember accent */}
        <Typography
          component={motion.h1}
          variants={item}
          sx={{
            fontSize: { xs: 44, sm: 66, md: 82 }, lineHeight: 0.98,
            fontFamily: DK.display, fontWeight: 800, letterSpacing: '-0.035em',
            background: `linear-gradient(180deg, ${DK.ink} 0%, rgba(244,239,233,0.78) 100%)`,
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}
        >
          Video calls for{' '}
          <Box component="span" sx={{
            background: `linear-gradient(180deg, ${DK.ember} 0%, ${DK.emberDark} 100%)`,
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>everyone.</Box>
        </Typography>

        {/* Subtitle */}
        <Typography
          component={motion.p}
          variants={item}
          sx={{ fontSize: { xs: 16, md: 18.5 }, lineHeight: 1.55, color: DK.dim, mt: 3, mb: 4.5, maxWidth: 560, fontFamily: DK.font, fontWeight: 500 }}
        >
          Spin up a room, share a link, and everyone's together in seconds. No downloads, no accounts to chase — just press start.
        </Typography>

        {/* CTA */}
        {!user ? (
          <Box component={motion.div} variants={item} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Button startIcon={<GoogleIcon />} onClick={() => login()} sx={{ ...primaryBtn, px: 5 }}>
              Sign in with Google
            </Button>
            <Typography sx={{ fontSize: 13.5, color: DK.faint, fontFamily: DK.font }}>
              Free · No credit card · Works in your browser
            </Typography>
          </Box>
        ) : (
          <Box component={motion.div} variants={item} sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {/* Google-Meet-style row: New meeting + join input on one line */}
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.75}
              sx={{ width: { xs: '100%', md: 'auto' }, alignItems: 'center', justifyContent: 'center' }}
            >
              <Button startIcon={<VideocamIcon />} onClick={handleNewMeeting} disabled={creating} sx={{ ...primaryBtn, width: { xs: '100%', md: 'auto' } }}>
                {creating ? 'Starting…' : 'New meeting'}
              </Button>

              {/* Join-by-code pill */}
              <Box
                component="form"
                onSubmit={handleJoin}
                sx={{
                  display: 'flex', alignItems: 'center', height: 56,
                  width: { xs: '100%', md: 440 }, pl: 2, pr: 0.75,
                  borderRadius: '999px', bgcolor: DK.surface, backdropFilter: 'blur(12px)',
                  border: `1px solid ${DK.line2}`,
                  transition: 'border-color 0.2s',
                  '&:focus-within': { borderColor: DK.ember },
                }}
              >
                <KeyboardIcon sx={{ color: DK.dim, fontSize: 21, mr: 1.25, flexShrink: 0 }} />
                <InputBase
                  fullWidth
                  placeholder="Enter a code or link"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  autoComplete="off"
                  sx={{
                    fontFamily: DK.font, fontSize: 15, color: DK.ink,
                    '& input::placeholder': { color: DK.faint, opacity: 1 },
                  }}
                />
                <Button
                  type="submit"
                  disabled={!joinCode.trim()}
                  endIcon={<ArrowIcon sx={{ fontSize: '18px !important' }} />}
                  sx={{
                    flexShrink: 0, borderRadius: '999px', px: 2.25, height: 44, ml: 1,
                    fontFamily: DK.font, fontWeight: 700, fontSize: 14.5, textTransform: 'none',
                    color: joinCode.trim() ? '#fff' : DK.faint,
                    bgcolor: joinCode.trim() ? DK.ember : 'transparent',
                    '&:hover': { bgcolor: joinCode.trim() ? DK.emberDark : DK.surface2 },
                    '&.Mui-disabled': { color: DK.faint },
                    transition: 'background-color 0.2s, color 0.2s',
                  }}
                >
                  Join
                </Button>
              </Box>
            </Stack>

            {/* Quiet secondary: schedule for later */}
            <Button
              startIcon={<CalendarIcon sx={{ fontSize: '19px !important' }} />}
              onClick={openSchedule}
              sx={{
                color: DK.dim, fontFamily: DK.font, fontWeight: 600, fontSize: 14, textTransform: 'none',
                borderRadius: '999px', px: 1.5,
                '&:hover': { color: DK.ink, bgcolor: DK.surface2 },
              }}
            >
              Schedule a meeting for later
            </Button>
          </Box>
        )}
      </Box>

      {/* Footer — pinned, out of flow so the page never scrolls */}
      <Box sx={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10, pointerEvents: 'none',
        px: { xs: 3, sm: 6, md: 9 }, py: 2,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1,
      }}>
        <Typography sx={{ fontSize: 12.5, color: DK.faint, fontFamily: DK.font }}>
          © 2026 A-Meet · Real-time video, reimagined
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: DK.faint, fontFamily: DK.font, display: { xs: 'none', sm: 'block' } }}>
          Built by <Box component="span" sx={{ color: DK.dim, fontWeight: 600 }}>Anuraj Jit Saikia</Box>
        </Typography>
      </Box>

      {/* Upcoming meetings — right drawer keeps the hero a clean single screen */}
      <Drawer
        anchor="right"
        open={upcomingOpen}
        onClose={() => setUpcomingOpen(false)}
        slotProps={{ paper: { sx: {
          width: { xs: '100%', sm: 420 }, bgcolor: '#16110d', backgroundImage: 'none',
          borderLeft: `1px solid ${DK.line2}`, color: DK.ink, p: 3,
        } } }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography sx={{ fontFamily: DK.display, fontWeight: 800, fontSize: 20, color: DK.ink }}>
            Your meetings
          </Typography>
          <IconButton onClick={() => setUpcomingOpen(false)} sx={{ color: DK.dim }}>
            <CloseIcon />
          </IconButton>
        </Stack>
        <UpcomingMeetings refreshKey={meetingsKey} onEdit={handleEditMeeting} />
        <Typography sx={{ fontFamily: DK.font, fontSize: 13.5, color: DK.faint, mt: 2 }}>
          Scheduled meetings show up here. Use{' '}
          <Box component="span" sx={{ color: DK.dim, fontWeight: 600 }}>Schedule</Box> to plan a new one.
        </Typography>
      </Drawer>

      <ScheduleMeetingDialog
        open={scheduleOpen}
        onClose={handleScheduleClose}
        existing={editingMeeting}
        onSaved={handleMeetingSaved}
      />
    </Box>
  );
}

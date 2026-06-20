import { useContext, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Avatar, Box, Button, FormControl,
  IconButton, InputLabel, MenuItem, Select,
  Stack, Tooltip, Typography,
} from '@mui/material';
import {
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
  Settings as SettingsIcon,
  ArrowForward as ArrowForwardIcon,
  LockOutlined as LockIcon,
  CheckRounded as CheckIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useLobbyMedia } from '../hooks/useLobbyMedia';
import { RoomMetaContext } from '../components/RoomGuard';
import VideoTile from '../components/VideoTile';
import BrandMark from '../components/BrandMark';
import EtherealShadow from '../components/EtherealShadow';
import { playSound } from '../services/sounds';
import { formatMeetingTime } from '../utils/format-time';

// Shared ember/smoke palette — identical to LandingPage so both read as one product.
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
  emberSoft: 'rgba(232,98,61,0.16)',
  sage:      '#7d9183',
  sageSoft:  'rgba(125,145,131,0.16)',
  panel:     '#1b140f',
  display:   '"Bricolage Grotesque", system-ui, sans-serif',
  font:      '"Plus Jakarta Sans", system-ui, sans-serif',
};

const EASE = [0.23, 1, 0.32, 1];
const EASE_CSS = 'cubic-bezier(0.23,1,0.32,1)';

// framer-motion entrance — same staggered rise the landing uses, so both pages
// animate identically. Variant names propagate down, so the panel nests its own
// stagger under the body container.
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};
const panelContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

// Flat ember CTA — matches the landing's primary button. No glow, no lift.
const primaryBtn = {
  height: 56, borderRadius: '999px',
  bgcolor: DK.ember, color: '#fff',
  fontFamily: DK.font, fontWeight: 700, fontSize: 16, letterSpacing: '0.005em',
  textTransform: 'none', boxShadow: 'none',
  '&:hover': { bgcolor: DK.emberDark, boxShadow: 'none' },
  '&:active': { bgcolor: DK.emberDark },
};

function PreviewToggle({ title, on, onClick, OnIcon, OffIcon, disabled }) {
  const btn = (
    <IconButton
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: 50, height: 50, borderRadius: '50%',
        bgcolor: on ? DK.surface2 : DK.emberSoft,
        border: `1.5px solid ${on ? DK.line2 : 'rgba(232,98,61,0.45)'}`,
        color: on ? DK.ink : DK.ember,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        transition: `all 0.25s ${EASE_CSS}`,
        '&:hover': {
          bgcolor: on ? 'rgba(255,255,255,0.13)' : 'rgba(232,98,61,0.26)',
          transform: 'translateY(-2px) scale(1.06)',
        },
        '&:active': { transform: 'scale(0.95)' },
        '&.Mui-disabled': {
          bgcolor: 'rgba(255,255,255,0.03)',
          color: DK.faint,
          border: `1.5px solid ${DK.line}`,
        },
      }}
    >
      {on ? <OnIcon /> : <OffIcon />}
    </IconButton>
  );
  return <Tooltip title={title}>{disabled ? <span>{btn}</span> : btn}</Tooltip>;
}

export default function LobbyPage() {
  const { roomId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const previewRef = useRef(null);

  const roomMeta = useContext(RoomMetaContext);
  const isScheduled = Boolean(roomMeta?.scheduledFor) && Boolean(roomMeta?.title);

  const {
    previewStream, videoDevices, audioDevices,
    selectedVideoId, selectedAudioId,
    videoOn, audioOn,
    setVideoDevice, setAudioDevice,
    toggleVideo, toggleAudio, stop,
  } = useLobbyMedia();

  useEffect(() => () => stop(), [stop]);

  function handleJoin() {
    stop();
    navigate(`/room/${roomId}`, {
      state: {
        // Marks this as a deliberate Join from the preview so RoomGuard lets it
        // through to /room instead of bouncing it back to the lobby.
        fromLobby: true,
        videoDeviceId: selectedVideoId,
        audioDeviceId: selectedAudioId,
        startVideoOn: videoOn,
        startAudioOn: audioOn,
      },
    });
  }

  const onToggleVideo = () => { playSound(videoOn ? 'toggleOff' : 'toggleOn'); toggleVideo(); };
  const onToggleAudio = () => { playSound(audioOn ? 'toggleOff' : 'toggleOn'); toggleAudio(); };

  function handlePreviewMouseMove(e) {
    const el = previewRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width  - 0.5;
    const cy = (e.clientY - rect.top)  / rect.height - 0.5;
    el.style.transition = 'transform 0.12s ease-out';
    el.style.transform  = `rotateX(${(-cy * 6).toFixed(2)}deg) rotateY(${(cx * 8).toFixed(2)}deg) scale(1.012)`;
  }

  function handlePreviewMouseLeave() {
    const el = previewRef.current;
    if (!el) return;
    el.style.transition = `transform 0.55s ${EASE_CSS}`;
    el.style.transform  = 'rotateX(0deg) rotateY(0deg) scale(1)';
  }

  // Camera + microphone selectors share one render; icon lives in the field.
  const deviceConfigs = [
    { label: 'Camera',     value: selectedVideoId, devices: videoDevices, onChange: setVideoDevice, Icon: VideocamIcon },
    { label: 'Microphone', value: selectedAudioId, devices: audioDevices, onChange: setAudioDevice, Icon: MicIcon },
  ];

  return (
    <Box sx={{
      minHeight: '100vh', bgcolor: DK.bg,
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>

      {/* ── Ethereal ember smoke (subdued, full-bleed) ─────────────────────── */}
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.55 }}>
        <EtherealShadow
          color="rgba(232, 98, 61, 0.92)"
          animation={{ scale: 88, speed: 60 }}
          noise={{ opacity: 0.32, scale: 1.1 }}
          sizing="fill"
        />
      </Box>

      {/* Scrim — darkens the center so the preview + panel stay crisp over smoke. */}
      <Box sx={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: [
          'radial-gradient(120% 90% at 50% 50%, transparent 0%, rgba(20,15,12,0.58) 58%, rgba(20,15,12,0.94) 100%)',
          'linear-gradient(to bottom, rgba(20,15,12,0.65) 0%, transparent 24%, transparent 72%, rgba(20,15,12,0.88) 100%)',
        ].join(', '),
      }} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <Box
        component="header"
        sx={{
          position: 'relative', zIndex: 10,
          height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: { xs: 2.5, sm: 5 },
        }}
      >
        <BrandMark />
        {user && (
          <Tooltip title={user.name || 'Account'} arrow>
            <Box sx={{
              p: '2px', borderRadius: '50%', display: 'inline-flex',
              border: `1.5px solid ${DK.ember}`, cursor: 'default',
              transition: `box-shadow 0.25s ${EASE_CSS}`,
              '&:hover': { boxShadow: '0 0 0 4px rgba(232,98,61,0.18)' },
            }}>
              <Avatar
                src={user.avatar}
                alt={user.name}
                imgProps={{ referrerPolicy: 'no-referrer' }}
                sx={{ width: 34, height: 34, fontFamily: DK.font, fontWeight: 700, bgcolor: DK.surface2, color: DK.ink }}
              />
            </Box>
          </Tooltip>
        )}
      </Box>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <Box
        component={motion.div}
        variants={container}
        initial="hidden"
        animate="show"
        sx={{
          position: 'relative', zIndex: 10,
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 4, md: 6 },
          px: { xs: 2.5, sm: 5 }, py: 5,
          maxWidth: 1160, width: '100%', mx: 'auto',
        }}
      >

        {/* ── Camera preview ───────────────────────────────────────────── */}
        <Box component={motion.div} variants={item} sx={{ width: '100%', maxWidth: 580 }}>
          <Box sx={{ perspective: '900px', perspectiveOrigin: '50% 50%' }}>
            <Box
              ref={previewRef}
              onMouseMove={handlePreviewMouseMove}
              onMouseLeave={handlePreviewMouseLeave}
              sx={{
                position: 'relative', width: '100%', aspectRatio: '16/10',
                borderRadius: '26px', overflow: 'hidden',
                bgcolor: 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${DK.line2}`,
                boxShadow: '0 40px 80px -30px rgba(0,0,0,0.72), 0 0 60px -30px rgba(232,98,61,0.18)',
                transformStyle: 'preserve-3d',
                willChange: 'transform',
              }}
            >
              <VideoTile
                stream={previewStream}
                muted
                name={user?.name}
                avatar={user?.avatar}
                videoOn={videoOn}
                audioOn={audioOn}
                mirror
              />
              {!videoOn && (
                <Typography sx={{
                  position: 'absolute', top: 16, left: 0, right: 0, textAlign: 'center',
                  color: DK.dim, fontSize: 14, fontFamily: DK.font,
                }}>
                  Camera is off
                </Typography>
              )}

              {/* Clean identity pill — name + "You" tag, ember status dot */}
              {user?.name && (
                <Box sx={{
                  position: 'absolute', left: 16, top: 16,
                  bgcolor: 'rgba(20,15,12,0.72)', borderRadius: '999px',
                  px: 1.5, py: 0.5, backdropFilter: 'blur(12px)',
                  border: `1px solid ${DK.line}`,
                  display: 'flex', alignItems: 'center', gap: 0.75,
                }}>
                  <Box sx={{
                    width: 6, height: 6, borderRadius: '50%',
                    bgcolor: DK.ember,
                    boxShadow: '0 0 6px 1px rgba(232,98,61,0.55)',
                  }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: DK.ink, fontFamily: DK.font }}>
                    {user.name}
                  </Typography>
                  <Box component="span" sx={{
                    fontSize: 10.5, fontWeight: 700, color: DK.sage, fontFamily: DK.font,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                    px: 0.65, py: '1px', borderRadius: '6px', bgcolor: DK.sageSoft,
                  }}>
                    You
                  </Box>
                </Box>
              )}

              <Stack
                direction="row"
                spacing={1.25}
                sx={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)' }}
              >
                <PreviewToggle
                  title={audioOn ? 'Mute' : 'Unmute'}
                  on={audioOn} onClick={onToggleAudio}
                  OnIcon={MicIcon} OffIcon={MicOffIcon}
                  disabled={audioDevices.length === 0}
                />
                <PreviewToggle
                  title={videoOn ? 'Turn off camera' : 'Turn on camera'}
                  on={videoOn} onClick={onToggleVideo}
                  OnIcon={VideocamIcon} OffIcon={VideocamOffIcon}
                  disabled={videoDevices.length === 0}
                />
                <Tooltip title="Settings">
                  <IconButton sx={{
                    width: 50, height: 50, borderRadius: '50%',
                    bgcolor: DK.surface2, border: `1.5px solid ${DK.line2}`,
                    color: DK.dim,
                    backdropFilter: 'blur(12px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                    transition: `all 0.25s ${EASE_CSS}`,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.13)', transform: 'translateY(-2px) scale(1.06)', color: DK.ink },
                    '&:active': { transform: 'scale(0.95)' },
                  }}>
                    <SettingsIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          </Box>

          {/* Device selectors — icon in field, checkmark on the active device */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            {deviceConfigs.map(({ label, value, devices, onChange, Icon }) => (
              <FormControl key={label} fullWidth size="small">
                <InputLabel sx={{
                  color: DK.faint, fontFamily: DK.font,
                  '&.Mui-focused': { color: DK.ember },
                }}>
                  {label}
                </InputLabel>
                <Select
                  value={value} label={label}
                  onChange={(e) => onChange(e.target.value)}
                  disabled={devices.length === 0}
                  renderValue={(selected) => {
                    const dev = devices.find((d) => d.deviceId === selected);
                    const text = dev?.label
                      || (selected ? `${label} ${String(selected).slice(0, 6)}` : `No ${label.toLowerCase()} found`);
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Icon sx={{ fontSize: 18, color: DK.sage, flexShrink: 0 }} />
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {text}
                        </Box>
                      </Box>
                    );
                  }}
                  sx={{
                    borderRadius: '12px', color: DK.ink, fontSize: 13,
                    fontFamily: DK.font, bgcolor: DK.surface,
                    backdropFilter: 'blur(8px)',
                    transition: `box-shadow 0.2s ${EASE_CSS}`,
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: DK.line },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: DK.line2 },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: DK.ember },
                    '& .MuiSvgIcon-root.MuiSelect-icon': { color: DK.faint },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        bgcolor: DK.panel, borderRadius: '14px',
                        border: `1px solid ${DK.line}`,
                        boxShadow: '0 16px 40px rgba(0,0,0,0.60)',
                        backdropFilter: 'blur(20px)',
                        backgroundImage: 'none',
                      },
                    },
                  }}
                >
                  {devices.length === 0 ? (
                    <MenuItem value="" sx={{ fontSize: 13, color: DK.faint, fontFamily: DK.font }}>
                      No {label.toLowerCase()} found
                    </MenuItem>
                  ) : (
                    devices.map((d) => (
                      <MenuItem key={d.deviceId} value={d.deviceId}
                        sx={{
                          fontSize: 13, color: DK.ink, fontFamily: DK.font,
                          display: 'flex', alignItems: 'center', gap: 1,
                          '&:hover': { bgcolor: DK.emberSoft, color: DK.ember },
                          '&.Mui-selected': { bgcolor: DK.sageSoft, '&:hover': { bgcolor: DK.sageSoft } },
                        }}>
                        <Box component="span" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.label || `${label} ${d.deviceId.slice(0, 6)}`}
                        </Box>
                        {d.deviceId === value && <CheckIcon sx={{ fontSize: 16, color: DK.sage, flexShrink: 0 }} />}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            ))}
          </Stack>
        </Box>

        {/* ── Join panel ───────────────────────────────────────────────── */}
        <Stack
          component={motion.div}
          variants={panelContainer}
          spacing={0}
          sx={{ width: { xs: '100%', md: 340 }, maxWidth: 400, position: 'relative' }}
        >

          {/* Eyebrow — landing-style, Google-Meet wording */}
          <Box component={motion.div} variants={item} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ width: 22, height: 1.5, bgcolor: DK.ember }} />
            <Typography sx={{
              fontSize: 12, fontWeight: 700, fontFamily: DK.font,
              letterSpacing: '0.16em', textTransform: 'uppercase', color: DK.sage,
            }}>
              {isScheduled ? 'Scheduled meeting' : "Your meeting's ready"}
            </Typography>
          </Box>

          <Box component={motion.div} variants={item} sx={{ mb: 1.5 }}>
            <Typography variant="h2" sx={{
              fontFamily: DK.display, fontWeight: 800,
              fontSize: { xs: 30, md: 38 }, letterSpacing: '-0.03em',
              color: DK.ink, lineHeight: 1.06,
            }}>
              Ready to join?
            </Typography>
          </Box>

          {/* Scheduled meeting info */}
          {isScheduled && (
            <Box component={motion.div} variants={item} sx={{ mb: 2 }}>
              <Typography sx={{
                fontFamily: DK.display, fontWeight: 700, fontSize: 18,
                color: DK.ink, lineHeight: 1.2, mb: 0.25,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 340,
              }}>
                {roomMeta.title}
              </Typography>
              <Typography sx={{ fontFamily: DK.font, fontSize: 13, color: DK.dim }}>
                {formatMeetingTime(roomMeta.scheduledFor)}
              </Typography>
            </Box>
          )}

          {/* Room code */}
          <Box component={motion.div} variants={item} sx={{ mb: 3.5 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <LockIcon sx={{ fontSize: 14, color: DK.sage }} />
              <Typography sx={{
                fontFamily: '"JetBrains Mono", monospace',
                color: DK.sage, letterSpacing: '0.10em', fontSize: 13,
              }}>
                {roomId}
              </Typography>
            </Stack>
          </Box>

          {/* Actions */}
          <Box component={motion.div} variants={item}>
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              onClick={handleJoin}
              fullWidth
              sx={{ ...primaryBtn, mb: 1.5 }}
            >
              Join now
            </Button>

            <Button
              fullWidth
              onClick={() => navigate('/')}
              sx={{
                bgcolor: DK.surface,
                border: `1.5px solid ${DK.line2}`,
                backdropFilter: 'blur(8px)',
                borderRadius: '999px', py: 1.75,
                color: DK.dim, fontSize: 15, fontFamily: DK.font, fontWeight: 600,
                textTransform: 'none',
                '&:hover': { bgcolor: DK.surface2, borderColor: DK.line2, color: DK.ink },
                transition: `all 0.25s ${EASE_CSS}`,
              }}
            >
              Leave
            </Button>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

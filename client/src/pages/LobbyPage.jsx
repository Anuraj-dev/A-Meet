import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
} from '@mui/icons-material';
import * as THREE from 'three';
import { useAuth } from '../context/AuthContext';
import { useLobbyMedia } from '../hooks/useLobbyMedia';
import VideoTile from '../components/VideoTile';
import BrandMark from '../components/BrandMark';
import { playSound } from '../services/sounds';

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

const EASE = 'cubic-bezier(0.23,1,0.32,1)';

function PreviewToggle({ title, on, onClick, OnIcon, OffIcon, disabled }) {
  const btn = (
    <IconButton
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: 50, height: 50, borderRadius: '50%',
        bgcolor: on ? DK.surface2 : DK.coralSoft,
        border: `1.5px solid ${on ? DK.line2 : 'rgba(255,107,74,0.40)'}`,
        color: on ? DK.ink : DK.coral,
        backdropFilter: 'blur(12px)',
        boxShadow: on
          ? '0 4px 12px rgba(0,0,0,0.35)'
          : '0 4px 12px rgba(255,107,74,0.30)',
        transition: `all 0.25s ${EASE}`,
        '&:hover': {
          bgcolor: on ? 'rgba(255,255,255,0.13)' : 'rgba(255,107,74,0.28)',
          transform: 'translateY(-2px) scale(1.06)',
          boxShadow: on
            ? '0 8px 20px rgba(0,0,0,0.50)'
            : '0 8px 20px rgba(255,107,74,0.45)',
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

function LobbyOrb() {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(320, 320);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 5;

    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const ptCoral = new THREE.PointLight(0xff6b4a, 1.2, 20);
    ptCoral.position.set(3, 3, 3);
    scene.add(ptCoral);
    const ptTeal = new THREE.PointLight(0x1fa98f, 0.8, 20);
    ptTeal.position.set(-3, -2, 2);
    scene.add(ptTeal);

    const icoGeo = new THREE.IcosahedronGeometry(2.4, 2);
    const icoMat = new THREE.MeshBasicMaterial({
      color: 0xff6b4a, wireframe: true, transparent: true, opacity: 0.15,
    });
    const icoMesh = new THREE.Mesh(icoGeo, icoMat);
    scene.add(icoMesh);

    const sphereGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x1fa98f, emissive: 0x1fa98f, emissiveIntensity: 0.4,
      roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.08,
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphereMesh);

    let rafId, t = 0;
    function animate() {
      rafId = requestAnimationFrame(animate);
      t += 0.006;
      icoMesh.rotation.x = t * 0.3;
      icoMesh.rotation.y = t * 0.5;
      sphereMesh.rotation.x = -t * 0.4;
      sphereMesh.rotation.y = -t * 0.2;
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      icoGeo.dispose();
      icoMat.dispose();
      sphereGeo.dispose();
      sphereMat.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <Box
      ref={mountRef}
      sx={{
        position: 'absolute',
        right: '-70px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: 320, height: 320,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.45,
        display: { xs: 'none', md: 'block' },
      }}
    />
  );
}

export default function LobbyPage() {
  const { roomId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const previewRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  const {
    previewStream, videoDevices, audioDevices,
    selectedVideoId, selectedAudioId,
    videoOn, audioOn,
    setVideoDevice, setAudioDevice,
    toggleVideo, toggleAudio, stop,
  } = useLobbyMedia();

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => () => stop(), [stop]);

  function handleJoin() {
    stop();
    navigate(`/room/${roomId}`, {
      state: {
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
    el.style.transition = `transform 0.55s ${EASE}`;
    el.style.transform  = 'rotateX(0deg) rotateY(0deg) scale(1)';
  }

  const panelSlide = (delayMs) => ({
    opacity:   mounted ? 1 : 0,
    transform: mounted ? 'translateX(0px)' : 'translateX(32px)',
    transition: `opacity 0.6s ${EASE} ${delayMs}ms, transform 0.6s ${EASE} ${delayMs}ms`,
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
      '@keyframes shimmer': {
        '0%':   { transform: 'translateX(-130%) skewX(-16deg)' },
        '100%': { transform: 'translateX(230%)  skewX(-16deg)' },
      },
      '@keyframes controlsFloat': {
        '0%':   { opacity: 0, transform: 'translateX(-50%) translateY(18px)' },
        '100%': { opacity: 1, transform: 'translateX(-50%) translateY(0px)'  },
      },
      '@keyframes coralGlowPulse': {
        '0%':   { boxShadow: '0 14px 40px -8px rgba(255,107,74,0.60)' },
        '50%':  { boxShadow: '0 18px 54px -8px rgba(255,107,74,0.90)' },
        '100%': { boxShadow: '0 14px 40px -8px rgba(255,107,74,0.60)' },
      },
    }}>

      {/* ── Glow blobs ───────────────────────────────────────────────────── */}
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <Box sx={{
          position: 'absolute', width: 360, height: 360, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,107,74,0.32) 0%, transparent 70%)',
          top: '-80px', left: '-60px',
          filter: 'blur(80px)',
          animation: 'blobDrift1 18s ease-in-out infinite alternate',
        }} />
        <Box sx={{
          position: 'absolute', width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(31,169,143,0.28) 0%, transparent 70%)',
          bottom: '-50px', right: '160px',
          filter: 'blur(70px)',
          animation: 'blobDrift2 22s ease-in-out infinite alternate',
        }} />
      </Box>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <Box
        component="header"
        sx={{
          position: 'relative', zIndex: 10,
          height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: { xs: 2.5, sm: 5 },
          borderBottom: `1px solid ${DK.line}`,
          bgcolor: 'rgba(12,11,18,0.85)',
          backdropFilter: 'blur(18px) saturate(160%)',
        }}
      >
        <BrandMark />
        {user && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography sx={{ color: DK.dim, display: { xs: 'none', sm: 'block' }, fontSize: 14, fontFamily: DK.font, fontWeight: 500 }}>
              {user.name}
            </Typography>
            <Avatar src={user.avatar} alt={user.name} sx={{ width: 32, height: 32 }} />
          </Stack>
        )}
      </Box>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <Box sx={{
        position: 'relative', zIndex: 10,
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: { xs: 'column', md: 'row' },
        gap: { xs: 4, md: 6 },
        px: { xs: 2.5, sm: 5 }, py: 5,
        maxWidth: 1160, width: '100%', mx: 'auto',
      }}>

        {/* ── Camera preview ───────────────────────────────────────────── */}
        <Box sx={{ width: '100%', maxWidth: 580 }}>
          <Box sx={{ perspective: '900px', perspectiveOrigin: '50% 50%' }}>
            <Box
              ref={previewRef}
              onMouseMove={handlePreviewMouseMove}
              onMouseLeave={handlePreviewMouseLeave}
              sx={{
                position: 'relative', width: '100%', aspectRatio: '16/10',
                borderRadius: '26px', overflow: 'hidden',
                bgcolor: 'rgba(31,169,143,0.08)',
                border: `1.5px solid rgba(31,169,143,0.25)`,
                boxShadow: '0 40px 80px -30px rgba(0,0,0,0.70), 0 0 60px -20px rgba(31,169,143,0.20)',
                transformStyle: 'preserve-3d',
                willChange: 'transform',
                opacity:   mounted ? 1 : 0,
                transition: `opacity 0.6s ${EASE} 60ms`,
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
              {user?.name && (
                <Box sx={{
                  position: 'absolute', left: 16, top: 16,
                  bgcolor: 'rgba(12,11,18,0.75)', borderRadius: '999px',
                  px: 1.5, py: 0.5, backdropFilter: 'blur(12px)',
                  border: `1px solid ${DK.line}`,
                  display: 'flex', alignItems: 'center', gap: 0.75,
                }}>
                  <Box sx={{
                    width: 6, height: 6, borderRadius: '50%',
                    bgcolor: DK.teal,
                    boxShadow: '0 0 6px 2px rgba(31,169,143,0.60)',
                  }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: DK.ink, fontFamily: DK.font }}>
                    {user.name} · looking good
                  </Typography>
                </Box>
              )}

              <Stack
                direction="row"
                spacing={1.25}
                sx={{
                  position: 'absolute', bottom: 18, left: '50%',
                  animation: mounted ? `controlsFloat 0.45s ${EASE} 350ms both` : 'none',
                }}
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
                    transition: `all 0.25s ${EASE}`,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.13)', transform: 'translateY(-2px) scale(1.06)', color: DK.ink },
                    '&:active': { transform: 'scale(0.95)' },
                  }}>
                    <SettingsIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          </Box>

          {/* Device selectors */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            {[
              { label: 'Camera',     value: selectedVideoId, devices: videoDevices, onChange: setVideoDevice },
              { label: 'Microphone', value: selectedAudioId, devices: audioDevices, onChange: setAudioDevice },
            ].map(({ label, value, devices, onChange }) => (
              <FormControl key={label} fullWidth size="small">
                <InputLabel sx={{
                  color: DK.faint, fontFamily: DK.font,
                  '&.Mui-focused': { color: DK.teal },
                }}>
                  {label}
                </InputLabel>
                <Select
                  value={value} label={label}
                  onChange={(e) => onChange(e.target.value)}
                  disabled={devices.length === 0}
                  sx={{
                    borderRadius: '12px', color: DK.ink, fontSize: 13,
                    fontFamily: DK.font, bgcolor: DK.surface,
                    backdropFilter: 'blur(8px)',
                    transition: `box-shadow 0.2s ${EASE}`,
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: DK.line },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: DK.line2 },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: DK.teal },
                    '& .MuiSvgIcon-root': { color: DK.faint },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        bgcolor: '#16141f', borderRadius: '14px',
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
                        sx={{ fontSize: 13, color: DK.ink, fontFamily: DK.font,
                          '&:hover': { bgcolor: DK.coralSoft, color: DK.coral },
                          '&.Mui-selected': { bgcolor: DK.tealSoft, '&:hover': { bgcolor: DK.tealSoft } },
                        }}>
                        {d.label || `${label} ${d.deviceId.slice(0, 6)}`}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            ))}
          </Stack>
        </Box>

        {/* ── Join panel ───────────────────────────────────────────────── */}
        <Stack spacing={0} sx={{ width: { xs: '100%', md: 340 }, maxWidth: 400, position: 'relative' }}>

          {/* Three.js orb — floats behind the panel */}
          <LobbyOrb />

          {/* "ALMOST THERE" pill */}
          <Box sx={{
            ...panelSlide(0),
            display: 'inline-flex', alignSelf: 'flex-start',
            px: 1.5, py: 0.6, borderRadius: '999px', mb: 2,
            bgcolor: DK.coralSoft, color: DK.coral,
            border: '1px solid rgba(255,107,74,0.30)',
            boxShadow: '0 0 16px rgba(255,107,74,0.25)',
          }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, fontFamily: DK.font, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Almost there
            </Typography>
          </Box>

          <Box sx={{ ...panelSlide(80), mb: 1.5 }}>
            <Typography variant="h2" sx={{
              fontFamily: DK.display, fontWeight: 800,
              fontSize: { xs: 30, md: 38 }, letterSpacing: '-0.03em',
              color: DK.ink, lineHeight: 1.06,
            }}>
              Ready to join?
            </Typography>
          </Box>

          {/* Room code */}
          <Box sx={{ ...panelSlide(160), mb: 3.5 }}>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <LockIcon sx={{ fontSize: 14, color: DK.teal }} />
              <Typography sx={{
                fontFamily: '"JetBrains Mono", monospace',
                color: DK.teal, letterSpacing: '0.10em', fontSize: 13,
                textShadow: '0 0 12px rgba(31,169,143,0.50)',
              }}>
                {roomId}
              </Typography>
            </Stack>
          </Box>

          {/* Join button */}
          <Box sx={{ ...panelSlide(240), position: 'relative', zIndex: 2 }}>
            <Button
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
              onClick={handleJoin}
              fullWidth
              sx={{
                bgcolor: DK.coral, color: '#fff',
                borderRadius: '999px', py: 2, fontSize: 16, fontWeight: 800,
                fontFamily: DK.font, mb: 1.5,
                position: 'relative', overflow: 'hidden',
                animation: 'coralGlowPulse 3s ease-in-out infinite',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  top: 0, left: 0, width: '45%', height: '100%',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 50%, transparent 100%)',
                  transform: 'translateX(-130%) skewX(-16deg)',
                  opacity: 0,
                },
                '&:hover': {
                  bgcolor: '#ff5235',
                  boxShadow: '0 20px 60px -8px rgba(255,107,74,0.80)',
                  transform: 'translateY(-3px)',
                  animation: 'none',
                  '&::after': {
                    opacity: 1,
                    animation: `shimmer 0.65s ${EASE} forwards`,
                  },
                },
                transition: `background-color 0.25s ${EASE}, box-shadow 0.25s ${EASE}, transform 0.25s ${EASE}`,
              }}
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
                '&:hover': { bgcolor: DK.surface2, borderColor: DK.line2, color: DK.ink, transform: 'translateY(-1px)' },
                transition: `all 0.25s ${EASE}`,
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

import { useMemo, useState } from 'react';
import {
  Avatar, Box, Button, Divider, IconButton, InputAdornment,
  ListItemIcon, ListItemText, Menu, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  GraphicEq as SpeakingIcon,
  MicOff as MicOffIcon,
  MoreVert as MoreVertIcon,
  PanTool as PanToolIcon,
  PersonRemove as RemoveIcon,
  PushPin as PinIcon,
  PushPinOutlined as PinOutlineIcon,
  RecordVoiceOver as AskUnmuteIcon,
  Search as SearchIcon,
  Stars as SpotlightIcon,
  VideocamOff as VideocamOffIcon,
} from '@mui/icons-material';

export interface PersonItem {
  id: string; name?: string; avatar?: string; audioOn?: boolean; videoOn?: boolean;
  handRaised?: boolean; isSpeaking?: boolean; isLocal?: boolean; isHost?: boolean; pinned?: boolean;
}
interface PeoplePanelProps {
  people?: PersonItem[]; currentUserIsHost?: boolean; onClose: () => void;
  onPin?: (person: PersonItem) => void; onSpotlight?: (person: PersonItem) => void;
  onMute?: (person: PersonItem) => void; onAskUnmute?: (person: PersonItem) => void;
  onRemove?: (person: PersonItem) => void; onMuteAll?: () => void; onAskUnmuteAll?: () => void;
}
interface PersonMenu { anchor: HTMLElement; person: PersonItem }

// In-call participants panel (M12). Shares ChatPanel's responsive shell — a
// 372px in-flow side column on desktop, a bottom sheet on mobile — and lives in
// the SAME single right rail (opening People closes Chat/Transcript, Meet-style).
//
// Contract (RoomPage wires these post-M11):
//   people: [{ id, name, avatar, audioOn, videoOn, handRaised, isSpeaking,
//              isLocal, isHost, pinned }]   — `id` is the socketId
//   currentUserIsHost: boolean             — gates the moderation actions
//   onClose()
//   onPin(person)        — local, any user (toggle pin-for-me)
//   onSpotlight(person)  — host only, forces this person big for EVERYONE
//   onMute(person)       — host only, enforced server-side pause
//   onAskUnmute(person)  — host only, sends a one-tap "unmute?" request
//   onRemove(person)     — host only
//   onMuteAll()          — host only
//   onAskUnmuteAll()     — host only
// Any handler omitted simply hides its affordance, so the panel renders fine
// before the wiring lands.
export default function PeoplePanel({
  people = [],
  currentUserIsHost = false,
  onClose,
  onPin,
  onSpotlight,
  onMute,
  onAskUnmute,
  onRemove,
  onMuteAll,
  onAskUnmuteAll,
}: PeoplePanelProps) {
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<PersonMenu | null>(null); // { anchor, person }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? people.filter((p) => p.name?.toLowerCase().includes(q)) : people;
    // Raised hands first, then speakers, then alphabetical — keeps the people
    // who need attention at the top, like Meet.
    return [...list].sort((a, b) => {
      if (!!b.handRaised !== !!a.handRaised) return b.handRaised ? 1 : -1;
      if (!!b.isSpeaking !== !!a.isSpeaking) return b.isSpeaking ? 1 : -1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }, [people, query]);

  const closeMenu = () => setMenuFor(null);
  const menuPerson = menuFor?.person;
  // Moderation menu is only meaningful for the host acting on OTHER people.
  const showMenuFor = (p: PersonItem) => !p.isLocal && Boolean(onPin || (currentUserIsHost && (onSpotlight || onMute || onAskUnmute || onRemove)));

  return (
    <>
      {/* Mobile backdrop */}
      <Box
        onClick={onClose}
        sx={{
          display: { xs: 'block', sm: 'none' },
          position: 'fixed', inset: 0, zIndex: 1299,
          bgcolor: 'rgba(0,0,0,0.55)',
        }}
      />
      <Box
        sx={{
          position: { xs: 'fixed', sm: 'relative' },
          bottom: { xs: 0, sm: 'auto' },
          left: { xs: 0, sm: 'auto' },
          right: { xs: 0, sm: 'auto' },
          zIndex: { xs: 1300, sm: 'auto' },
          width: { xs: '100%', sm: 372 },
          height: { xs: '62vh', sm: 'auto' },
          flexShrink: 0,
          m: { xs: 0, sm: 1 },
          ml: { sm: 0 },
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          bgcolor: { xs: 'rgba(20,15,12,0.97)', sm: 'background.paper' },
          borderRadius: { xs: '20px 20px 0 0', sm: 3 },
          border: { sm: '1px solid rgba(255,255,255,0.06)' },
          boxShadow: { xs: '0 -8px 40px rgba(0,0,0,0.6)', sm: 'none' },
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          animation: 'ameet-fade-in 0.22s ease-out',
        }}
      >
        {/* Drag handle — mobile only */}
        <Box sx={{ display: { xs: 'flex', sm: 'none' }, justifyContent: 'center', pt: 1.25, pb: 0.5, flexShrink: 0 }}>
          <Box sx={{ width: 40, height: 4, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.2)' }} />
        </Box>

        {/* Header */}
        <Box
          sx={{
            px: 2, py: 1.5,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid', borderColor: 'divider',
          }}
        >
          <Typography sx={{ fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: 600 }}>
            People
            <Box component="span" sx={{ ml: 1, color: 'text.secondary', fontWeight: 500, fontSize: 14 }}>
              {people.length}
            </Box>
          </Typography>
          <Tooltip title="Close">
            <IconButton aria-label="Close" size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Host bulk actions */}
        {currentUserIsHost && (onMuteAll || onAskUnmuteAll) && (
          <Box sx={{ px: 2, pt: 1.5, display: 'flex', gap: 1 }}>
            {onMuteAll && (
              <Button
                size="small" variant="outlined" startIcon={<MicOffIcon sx={{ fontSize: 16 }} />}
                onClick={onMuteAll}
                sx={{ flex: 1, borderRadius: 999, color: 'text.primary', borderColor: 'divider', '&:hover': { borderColor: 'text.secondary' } }}
              >
                Mute all
              </Button>
            )}
            {onAskUnmuteAll && (
              <Button
                size="small" variant="outlined" startIcon={<AskUnmuteIcon sx={{ fontSize: 16 }} />}
                onClick={onAskUnmuteAll}
                sx={{ flex: 1, borderRadius: 999, color: 'text.primary', borderColor: 'divider', '&:hover': { borderColor: 'text.secondary' } }}
              >
                Ask all to unmute
              </Button>
            )}
          </Box>
        )}

        {/* Search */}
        <Box sx={{ px: 2, py: 1.5 }}>
          <TextField
            fullWidth size="small" placeholder="Search people"
            value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
            slotProps={{
              input: {
                sx: { borderRadius: 999, bgcolor: 'rgba(255,255,255,0.04)' },
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        {/* List */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1.5 }}>
          {filtered.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
              No one matches “{query}”.
            </Typography>
          )}
          {filtered.map((p) => (
            <Box
              key={p.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.25,
                px: 1.5, py: 1, borderRadius: 2,
                transition: 'background-color 0.15s',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
              }}
            >
              <Box sx={{ position: 'relative', flexShrink: 0 }}>
                <Avatar src={p.avatar} alt={p.name} sx={{ width: 36, height: 36, fontSize: 15 }}>
                  {p.name?.[0]}
                </Avatar>
                {/* Speaking ring — green, the live-voice cue */}
                {p.isSpeaking && p.audioOn && (
                  <Box
                    aria-hidden
                    sx={{
                      position: 'absolute', inset: -2, borderRadius: '50%',
                      boxShadow: '0 0 0 2px #34d399', pointerEvents: 'none',
                    }}
                  />
                )}
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                  {p.name}{p.isLocal ? ' (You)' : ''}
                </Typography>
                {p.isHost && (
                  <Typography variant="caption" color="text.secondary">Admin</Typography>
                )}
              </Box>

              {/* Status icons */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, color: 'text.secondary' }}>
                {p.handRaised && <PanToolIcon titleAccess="Hand raised" sx={{ fontSize: 18, color: 'warning.main' }} />}
                {p.pinned && <PinIcon titleAccess="Pinned" sx={{ fontSize: 16, color: 'primary.main' }} />}
                {!p.videoOn && <VideocamOffIcon titleAccess="Camera off" sx={{ fontSize: 18 }} />}
                {p.audioOn
                  ? (p.isSpeaking && <SpeakingIcon titleAccess="Speaking" sx={{ fontSize: 18, color: 'success.main' }} />)
                  : <MicOffIcon titleAccess="Microphone off" sx={{ fontSize: 18 }} />}
                {showMenuFor(p) && (
                  <IconButton
                    size="small"
                    aria-label={`More actions for ${p.name}`}
                    onClick={(e) => setMenuFor({ anchor: e.currentTarget, person: p })}
                    sx={{ color: 'text.secondary' }}
                  >
                    <MoreVertIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Per-person action menu */}
      <Menu
        anchorEl={menuFor?.anchor}
        open={Boolean(menuFor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        {onPin && menuPerson && (
          <MenuItem onClick={() => { onPin(menuPerson); closeMenu(); }}>
            <ListItemIcon>{menuPerson.pinned ? <PinIcon fontSize="small" /> : <PinOutlineIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{menuPerson.pinned ? 'Unpin for me' : 'Pin for me'}</ListItemText>
          </MenuItem>
        )}
        {currentUserIsHost && onSpotlight && menuPerson && (
          <MenuItem onClick={() => { onSpotlight(menuPerson); closeMenu(); }}>
            <ListItemIcon><SpotlightIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Spotlight for everyone</ListItemText>
          </MenuItem>
        )}
        {currentUserIsHost && (onMute || onAskUnmute) && <Divider />}
        {currentUserIsHost && onMute && menuPerson?.audioOn && (
          <MenuItem onClick={() => { onMute(menuPerson); closeMenu(); }}>
            <ListItemIcon><MicOffIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Mute</ListItemText>
          </MenuItem>
        )}
        {currentUserIsHost && onAskUnmute && menuPerson && !menuPerson.audioOn && (
          <MenuItem onClick={() => { onAskUnmute(menuPerson); closeMenu(); }}>
            <ListItemIcon><AskUnmuteIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Ask to unmute</ListItemText>
          </MenuItem>
        )}
        {currentUserIsHost && onRemove && menuPerson && (
          <MenuItem onClick={() => { onRemove(menuPerson); closeMenu(); }} sx={{ color: 'error.main' }}>
            <ListItemIcon><RemoveIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
            <ListItemText>Remove from call</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

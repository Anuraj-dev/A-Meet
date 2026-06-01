import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Button, IconButton, Menu, MenuItem, ListItemIcon,
  CircularProgress, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  MoreVertRounded as MoreIcon,
  EditRounded as EditIcon,
  LinkRounded as LinkIcon,
  ContentCopyRounded as CopyIcon,
  EventAvailableRounded as EventIcon,
  DeleteOutlineRounded as DeleteIcon,
  VideocamRounded as VideocamIcon,
  CalendarMonthRounded as CalendarIcon,
} from '@mui/icons-material';
import { getMyMeetings, cancelMeeting } from '../api/meetings';
import { formatMeetingTime, relativeTime } from '../utils/format-time';
import { buildJoinUrl, buildGoogleCalendarUrl, buildInviteText } from '../utils/calendar-invite';

const DK = {
  surface:  'rgba(255,255,255,0.05)',
  surface2: 'rgba(255,255,255,0.09)',
  ink:      '#f2ede8',
  dim:      '#9d9590',
  faint:    '#6a6560',
  line:     'rgba(255,255,255,0.10)',
  line2:    'rgba(255,255,255,0.18)',
  coral:    '#ff6b4a',
  teal:     '#1fa98f',
  font:     '"Plus Jakarta Sans", system-ui, sans-serif',
  display:  '"Bricolage Grotesque", system-ui, sans-serif',
  menuBg:   '#1b1925',
};

export default function UpcomingMeetings({ refreshKey, onEdit }) {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [toast, setToast] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setMeetings(await getMyMeetings());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  function openMenu(e, meeting) {
    setAnchorEl(e.currentTarget);
    setMenuFor(meeting);
  }
  function closeMenu() {
    setAnchorEl(null);
    setMenuFor(null);
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(label);
    } catch {
      setToast('Could not copy');
    }
  }

  function inviteFor(m) {
    const joinUrl = buildJoinUrl(m.roomId);
    return buildInviteText({ title: m.title, when: formatMeetingTime(m.scheduledFor), joinUrl });
  }
  function gcalFor(m) {
    const joinUrl = buildJoinUrl(m.roomId);
    return buildGoogleCalendarUrl({
      title: m.title,
      details: `${m.description ? m.description + '\n\n' : ''}Join: ${joinUrl}`,
      start: m.scheduledFor,
    });
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelMeeting(cancelTarget.roomId);
      setMeetings((prev) => prev.filter((m) => m.roomId !== cancelTarget.roomId));
      setToast('Meeting cancelled');
    } catch {
      setToast('Could not cancel — try again');
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  }

  // Hide the whole section while empty (and not loading) — the Schedule button
  // is the entry point; an empty card would just be clutter.
  if (!loading && !loadError && meetings.length === 0) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <CalendarIcon sx={{ color: DK.coral, fontSize: 20 }} />
        <Typography sx={{ fontFamily: DK.display, fontWeight: 800, fontSize: 18, color: DK.ink }}>
          Upcoming meetings
        </Typography>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={26} sx={{ color: DK.coral }} />
        </Box>
      ) : loadError ? (
        <Typography sx={{ color: DK.faint, fontFamily: DK.font, fontSize: 14 }}>
          Couldn’t load your meetings.{' '}
          <Box component="span" onClick={load}
            sx={{ color: DK.coral, cursor: 'pointer', fontWeight: 600 }}>Retry</Box>
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {meetings.map((m) => (
            <Box
              key={m.roomId}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                p: 1.5, borderRadius: '16px',
                bgcolor: DK.surface, border: `1px solid ${DK.line}`,
                transition: 'border-color 0.2s, background-color 0.2s',
                '&:hover': { borderColor: DK.line2, bgcolor: DK.surface2 },
              }}
            >
              {/* Date chip */}
              <Box sx={{
                flexShrink: 0, width: 46, height: 46, borderRadius: '12px',
                display: 'grid', placeItems: 'center', textAlign: 'center',
                bgcolor: 'rgba(255,107,74,0.13)', border: '1px solid rgba(255,107,74,0.25)',
              }}>
                <Typography sx={{ fontFamily: DK.font, fontWeight: 800, fontSize: 16, lineHeight: 1, color: DK.coral }}>
                  {new Date(m.scheduledFor).getDate()}
                </Typography>
                <Typography sx={{ fontFamily: DK.font, fontWeight: 700, fontSize: 9.5, color: DK.coral, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {new Date(m.scheduledFor).toLocaleDateString(undefined, { month: 'short' })}
                </Typography>
              </Box>

              {/* Title + time */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{
                  fontFamily: DK.font, fontWeight: 700, fontSize: 15, color: DK.ink,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {m.title || 'Untitled meeting'}
                </Typography>
                <Typography sx={{ fontFamily: DK.font, fontSize: 12.5, color: DK.dim }}>
                  {formatMeetingTime(m.scheduledFor)}
                  <Box component="span" sx={{ color: DK.faint }}>{' · '}{relativeTime(m.scheduledFor)}</Box>
                </Typography>
              </Box>

              {/* Join */}
              <Button
                size="small" startIcon={<VideocamIcon />}
                onClick={() => navigate(`/lobby/${encodeURIComponent(m.roomId)}`)}
                sx={{
                  flexShrink: 0, bgcolor: DK.coral, color: '#fff', borderRadius: '999px',
                  px: 2, fontFamily: DK.font, fontWeight: 700, textTransform: 'none',
                  '&:hover': { bgcolor: '#ff5235' },
                }}
              >
                Join
              </Button>

              <IconButton size="small" onClick={(e) => openMenu(e, m)} sx={{ color: DK.dim, flexShrink: 0 }}>
                <MoreIcon />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}

      {/* Per-meeting overflow menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        slotProps={{
          paper: {
            sx: {
              bgcolor: DK.menuBg, color: DK.ink, borderRadius: '14px',
              border: `1px solid ${DK.line2}`, backgroundImage: 'none', minWidth: 210,
              '& .MuiMenuItem-root': { fontFamily: DK.font, fontSize: 14, py: 1 },
              '& .MuiListItemIcon-root': { color: DK.dim, minWidth: 34 },
            },
          },
        }}
      >
        <MenuItem onClick={() => { onEdit?.(menuFor); closeMenu(); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>Edit
        </MenuItem>
        <MenuItem onClick={() => { copy(buildJoinUrl(menuFor.roomId), 'Link copied'); closeMenu(); }}>
          <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>Copy link
        </MenuItem>
        <MenuItem onClick={() => { copy(inviteFor(menuFor), 'Invite copied'); closeMenu(); }}>
          <ListItemIcon><CopyIcon fontSize="small" /></ListItemIcon>Copy invite
        </MenuItem>
        <MenuItem
          component="a" href={menuFor ? gcalFor(menuFor) : '#'} target="_blank" rel="noopener noreferrer"
          onClick={closeMenu}
        >
          <ListItemIcon><EventIcon fontSize="small" /></ListItemIcon>Add to Google Calendar
        </MenuItem>
        <MenuItem
          onClick={() => { setCancelTarget(menuFor); closeMenu(); }}
          sx={{ color: '#ff7a5c', '& .MuiListItemIcon-root': { color: '#ff7a5c !important' } }}
        >
          <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>Cancel meeting
        </MenuItem>
      </Menu>

      {/* Cancel confirmation */}
      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => !cancelling && setCancelTarget(null)}
        slotProps={{ paper: { sx: {
          bgcolor: '#16141f', color: DK.ink, borderRadius: '18px',
          border: `1px solid ${DK.line2}`, backgroundImage: 'none', maxWidth: 380,
        } } }}
      >
        <DialogTitle sx={{ fontFamily: DK.display, fontWeight: 800, fontSize: 19 }}>
          Cancel this meeting?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: DK.dim, fontFamily: DK.font, fontSize: 14.5 }}>
            “{cancelTarget?.title || 'Untitled meeting'}” will be removed and its link will stop working.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setCancelTarget(null)} disabled={cancelling}
            sx={{ color: DK.dim, fontFamily: DK.font, fontWeight: 600, textTransform: 'none' }}>
            Keep it
          </Button>
          <Button onClick={confirmCancel} disabled={cancelling}
            sx={{
              bgcolor: '#e1503a', color: '#fff', borderRadius: '999px', px: 2.5, fontWeight: 700,
              fontFamily: DK.font, textTransform: 'none', '&:hover': { bgcolor: '#cf4530' },
              '&.Mui-disabled': { bgcolor: DK.faint, color: 'rgba(255,255,255,0.4)' },
            }}>
            {cancelling ? 'Cancelling…' : 'Cancel meeting'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={1800}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

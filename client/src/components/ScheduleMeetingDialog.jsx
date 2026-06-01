import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, IconButton, TextField, Typography, Stack, Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  CalendarMonthRounded as CalendarIcon,
  ContentCopyRounded as CopyIcon,
  EventAvailableRounded as EventIcon,
  CheckRounded as CheckIcon,
  LinkRounded as LinkIcon,
} from '@mui/icons-material';
import { scheduleMeeting, updateMeeting } from '../api/meetings';
import { toDatetimeLocalValue, formatMeetingTime } from '../utils/format-time';
import { buildJoinUrl, buildGoogleCalendarUrl, buildInviteText } from '../utils/calendar-invite';

const DK = {
  bg:       '#16141f',
  surface:  'rgba(255,255,255,0.05)',
  surface2: 'rgba(255,255,255,0.09)',
  ink:      '#f2ede8',
  dim:      '#9d9590',
  faint:    '#6a6560',
  line:     'rgba(255,255,255,0.12)',
  line2:    'rgba(255,255,255,0.20)',
  coral:    '#ff6b4a',
  teal:     '#1fa98f',
  font:     '"Plus Jakarta Sans", system-ui, sans-serif',
  display:  '"Bricolage Grotesque", system-ui, sans-serif',
};

// Default to the next full hour, at least ~50 min out.
function defaultStart() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toDatetimeLocalValue(d);
}

const fieldSx = {
  '& .MuiInputBase-root': {
    borderRadius: '12px', bgcolor: DK.surface, color: DK.ink, fontFamily: DK.font,
  },
  '& .MuiInputBase-input': { color: DK.ink },
  '& .MuiInputBase-input::placeholder': { color: DK.faint, opacity: 1 },
  '& .MuiInputLabel-root': { color: DK.dim, fontFamily: DK.font },
  '& .MuiInputLabel-root.Mui-focused': { color: DK.coral },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: DK.line },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: DK.line2 },
  '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${DK.coral} !important` },
  // Make the native datetime-local picker indicator visible on the dark surface.
  '& input[type="datetime-local"]::-webkit-calendar-picker-indicator': {
    filter: 'invert(0.8)', cursor: 'pointer',
  },
};

export default function ScheduleMeetingDialog({ open, onClose, existing = null, onSaved }) {
  const isEdit = Boolean(existing);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(defaultStart);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null); // success view payload (create mode)
  const [copied, setCopied] = useState('');

  // (Re)seed the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setError('');
    setCreated(null);
    setCopied('');
    setSubmitting(false);
    if (existing) {
      setTitle(existing.title || '');
      setWhen(toDatetimeLocalValue(existing.scheduledFor));
      setDescription(existing.description || '');
    } else {
      setTitle('');
      setWhen(defaultStart());
      setDescription('');
    }
  }, [open, existing]);

  async function handleSubmit() {
    setError('');
    if (!title.trim()) { setError('Give your meeting a title'); return; }
    if (!when) { setError('Pick a date and time'); return; }
    const scheduledFor = new Date(when);
    if (Number.isNaN(scheduledFor.getTime())) { setError('That date looks off'); return; }
    if (!isEdit && scheduledFor.getTime() <= Date.now()) {
      setError('Pick a time in the future'); return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        scheduledFor: scheduledFor.toISOString(),
        description: description.trim(),
      };
      if (isEdit) {
        const updated = await updateMeeting(existing.roomId, payload);
        onSaved?.(updated);
        onClose?.();
      } else {
        const meeting = await scheduleMeeting(payload);
        onSaved?.(meeting);
        setCreated(meeting);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(kind, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setError('Could not copy — copy it manually.');
    }
  }

  // ── Success view (create only) ──────────────────────────────────────────
  const joinUrl = created ? buildJoinUrl(created.roomId) : '';
  const whenLabel = created ? formatMeetingTime(created.scheduledFor) : '';
  const gcalUrl = created
    ? buildGoogleCalendarUrl({
        title: created.title,
        details: `${created.description ? created.description + '\n\n' : ''}Join: ${joinUrl}`,
        start: created.scheduledFor,
      })
    : '';
  const inviteText = created
    ? buildInviteText({ title: created.title, when: whenLabel, joinUrl })
    : '';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            bgcolor: DK.bg, color: DK.ink, borderRadius: '20px',
            border: `1px solid ${DK.line}`,
            backgroundImage: 'none',
            boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
          },
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <Box sx={{
          width: 38, height: 38, borderRadius: '11px', display: 'grid', placeItems: 'center',
          bgcolor: 'rgba(255,107,74,0.15)', color: DK.coral,
        }}>
          {created ? <CheckIcon /> : <CalendarIcon />}
        </Box>
        <Typography sx={{ flex: 1, fontFamily: DK.display, fontWeight: 800, fontSize: 20 }}>
          {created ? 'Meeting scheduled' : isEdit ? 'Edit meeting' : 'Schedule a meeting'}
        </Typography>
        <IconButton onClick={onClose} sx={{ color: DK.dim }}><CloseIcon /></IconButton>
      </DialogTitle>

      {!created ? (
        <>
          <DialogContent sx={{ pt: 1 }}>
            <Stack spacing={2.5} sx={{ mt: 0.5 }}>
              <TextField
                autoFocus fullWidth label="Title" placeholder="e.g. Weekly sync"
                value={title} onChange={(e) => setTitle(e.target.value)}
                sx={fieldSx}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 200 } }}
              />
              <TextField
                fullWidth type="datetime-local" label="Date & time"
                value={when} onChange={(e) => setWhen(e.target.value)}
                sx={fieldSx}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: !isEdit ? { min: toDatetimeLocalValue(new Date()) } : undefined,
                }}
              />
              <TextField
                fullWidth multiline minRows={2} maxRows={5}
                label="Description" placeholder="Agenda, notes, anything (optional)"
                value={description} onChange={(e) => setDescription(e.target.value)}
                sx={fieldSx}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 2000 } }}
              />
              {error && (
                <Typography sx={{ color: '#ff8a6d', fontSize: 13.5, fontFamily: DK.font }}>
                  {error}
                </Typography>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
            <Button onClick={onClose} sx={{ color: DK.dim, fontFamily: DK.font, fontWeight: 600 }}>
              Cancel
            </Button>
            <Button
              variant="contained" onClick={handleSubmit} disabled={submitting}
              sx={{
                bgcolor: DK.coral, color: '#fff', borderRadius: '999px', px: 3, fontWeight: 700,
                fontFamily: DK.font, textTransform: 'none',
                '&:hover': { bgcolor: '#ff5235' },
                '&.Mui-disabled': { bgcolor: DK.faint, color: 'rgba(255,255,255,0.4)' },
              }}
            >
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Schedule'}
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent sx={{ pt: 1 }}>
            <Typography sx={{ color: DK.dim, fontFamily: DK.font, fontSize: 14.5, mb: 2 }}>
              <Box component="span" sx={{ color: DK.ink, fontWeight: 700 }}>{created.title}</Box>
              {' · '}{whenLabel}
            </Typography>

            {/* Join link row */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1, p: 1.25, borderRadius: '12px',
              bgcolor: DK.surface, border: `1px solid ${DK.line}`,
            }}>
              <LinkIcon sx={{ color: DK.teal, fontSize: 20 }} />
              <Typography sx={{
                flex: 1, fontFamily: DK.font, fontSize: 13.5, color: DK.ink,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {joinUrl}
              </Typography>
              <Button
                size="small" startIcon={copied === 'link' ? <CheckIcon /> : <CopyIcon />}
                onClick={() => copy('link', joinUrl)}
                sx={{ color: copied === 'link' ? DK.teal : DK.dim, fontFamily: DK.font,
                      textTransform: 'none', flexShrink: 0 }}
              >
                {copied === 'link' ? 'Copied' : 'Copy'}
              </Button>
            </Box>

            <Divider sx={{ my: 2, borderColor: DK.line }} />

            <Stack direction="row" spacing={1.5}>
              <Button
                fullWidth component="a" href={gcalUrl} target="_blank" rel="noopener noreferrer"
                startIcon={<EventIcon />}
                sx={{
                  bgcolor: DK.surface, color: DK.ink, borderRadius: '12px', py: 1.25,
                  border: `1px solid ${DK.line}`, fontFamily: DK.font, fontWeight: 600,
                  textTransform: 'none',
                  '&:hover': { bgcolor: DK.surface2, borderColor: DK.line2 },
                }}
              >
                Add to Google Calendar
              </Button>
              <Button
                fullWidth startIcon={copied === 'invite' ? <CheckIcon /> : <CopyIcon />}
                onClick={() => copy('invite', inviteText)}
                sx={{
                  bgcolor: DK.surface, color: copied === 'invite' ? DK.teal : DK.ink,
                  borderRadius: '12px', py: 1.25,
                  border: `1px solid ${DK.line}`, fontFamily: DK.font, fontWeight: 600,
                  textTransform: 'none',
                  '&:hover': { bgcolor: DK.surface2, borderColor: DK.line2 },
                }}
              >
                {copied === 'invite' ? 'Invite copied' : 'Copy invite'}
              </Button>
            </Stack>
            {error && (
              <Typography sx={{ color: '#ff8a6d', fontSize: 13, fontFamily: DK.font, mt: 1.5 }}>
                {error}
              </Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button
              variant="contained" onClick={onClose}
              sx={{
                bgcolor: DK.coral, color: '#fff', borderRadius: '999px', px: 3, fontWeight: 700,
                fontFamily: DK.font, textTransform: 'none', '&:hover': { bgcolor: '#ff5235' },
              }}
            >
              Done
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

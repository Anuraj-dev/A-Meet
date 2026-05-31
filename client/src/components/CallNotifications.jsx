import { Avatar, Box, Typography } from '@mui/material';
import {
  Login as LoginIcon,
  Logout as LogoutIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';

// Bottom-left transient overlay (like Google Meet):
//  • event flashes — "<name> joined" / "<name> left", and short info toasts
//  • chat previews — avatar + name + message when the chat panel is closed
// Notes auto-dismiss on a timer (managed by the parent); chat previews open
// the chat when clicked.

function EventNote({ note }) {
  const label = note.text ?? `${note.name} ${note.variant === 'leave' ? 'left' : 'joined'}`;
  const Icon = note.variant === 'leave' ? LogoutIcon : note.variant === 'info' ? InfoIcon : LoginIcon;
  return (
    <Box
      sx={{
        pointerEvents: 'auto',
        alignSelf: 'flex-start',
        maxWidth: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'rgba(0,0,0,0.82)',
        color: '#fff',
        borderRadius: 999,
        pl: note.avatar ? 0.5 : 1.5,
        pr: 1.75,
        py: 0.5,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'ameet-fade-in 0.25s ease-out',
      }}
    >
      {note.avatar ? (
        <Avatar src={note.avatar} alt={note.name} sx={{ width: 28, height: 28, fontSize: 13 }}>
          {note.name?.[0]}
        </Avatar>
      ) : (
        <Icon sx={{ fontSize: 18, color: 'text.secondary' }} />
      )}
      <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
    </Box>
  );
}

function ChatNote({ note, onOpen }) {
  return (
    <Box
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      sx={{
        pointerEvents: 'auto',
        cursor: 'pointer',
        width: '100%',
        display: 'flex',
        gap: 1.25,
        bgcolor: 'rgba(20,21,24,0.92)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 2.5,
        p: 1.25,
        boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'ameet-fade-in 0.25s ease-out',
        transition: 'background-color 0.15s ease',
        '&:hover': { bgcolor: 'rgba(40,42,48,0.95)' },
      }}
    >
      <Avatar src={note.avatar} alt={note.name} sx={{ width: 34, height: 34, fontSize: 14, flexShrink: 0 }}>
        {note.name?.[0]}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          noWrap
          sx={{ fontWeight: 600, color: 'primary.main', display: 'block', lineHeight: 1.3 }}
        >
          {note.name}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: 'text.primary',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
            lineHeight: 1.35,
          }}
        >
          {note.text}
        </Typography>
      </Box>
    </Box>
  );
}

export default function CallNotifications({ notes, onOpenChat, onDismiss }) {
  if (!notes?.length) return null;
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-atomic="false"
      sx={{
        position: 'absolute',
        left: { xs: 8, sm: 20 },
        bottom: { xs: 84, sm: 92 },
        zIndex: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        width: { xs: 'calc(100% - 16px)', sm: 320 },
        maxWidth: 'calc(100% - 16px)',
        pointerEvents: 'none',
      }}
    >
      {notes.map((n) =>
        n.kind === 'chat' ? (
          <ChatNote key={n.id} note={n} onOpen={() => { onOpenChat(); onDismiss(n.id); }} />
        ) : (
          <EventNote key={n.id} note={n} />
        )
      )}
    </Box>
  );
}

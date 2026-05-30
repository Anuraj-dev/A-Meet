import { useRef, useState } from 'react';
import {
  Badge, Box, Divider, IconButton, ListItemIcon, ListItemText,
  Menu, MenuItem, Tooltip, useMediaQuery,
} from '@mui/material';
import {
  CallEnd as CallEndIcon,
  Chat as ChatIcon,
  ChatOutlined as ChatOutlineIcon,
  ContentCopy as ContentCopyIcon,
  EmojiEmotions as EmojiEmotionsIcon,
  MoreVert as MoreVertIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  PanTool as PanToolIcon,
  PresentToAll as PresentIcon,
  CancelPresentation as StopPresentIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
} from '@mui/icons-material';

// One round control button. `variant` drives the Meet-style color states.
function CircleButton({ title, onClick, disabled, variant = 'idle', badge = 0, children }) {
  const styles = {
    idle: { bgcolor: 'control.idle', color: 'text.primary', '&:hover': { bgcolor: 'control.idleHover' } },
    danger: { bgcolor: 'error.main', color: '#fff', '&:hover': { bgcolor: 'error.dark' } },
    active: { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.main', filter: 'brightness(0.92)' } },
    warning: { bgcolor: 'warning.main', color: 'warning.contrastText', '&:hover': { bgcolor: 'warning.dark' } },
  }[variant];

  const btn = (
    <IconButton
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: { xs: 44, sm: 50 },
        height: { xs: 44, sm: 50 },
        '&.Mui-disabled': { bgcolor: 'control.idle', color: 'text.disabled', opacity: 0.55 },
        '& svg': { fontSize: { xs: 21, sm: 23 } },
        ...styles,
      }}
    >
      <Badge badgeContent={badge} color="error" max={9} overlap="circular">
        {children}
      </Badge>
    </IconButton>
  );

  // Tooltip needs a focusable wrapper around a disabled button.
  return (
    <Tooltip title={title}>{disabled ? <span style={{ display: 'inline-flex' }}>{btn}</span> : btn}</Tooltip>
  );
}

export default function ControlBar({
  localAudioOn, hasMic, onToggleAudio,
  localVideoOn, onToggleVideo,
  isScreenSharing, onToggleShare,
  handRaised, onToggleHand,
  onReact,
  showChat, unreadCount, onToggleChat,
  soundEnabled, onToggleSound,
  onCopyLink,
  onLeave,
}) {
  const isMobile = useMediaQuery((t) => t.breakpoints.down('sm'));
  const [moreAnchor, setMoreAnchor] = useState(null);
  const moreRef = useRef(null);
  const closeMore = () => setMoreAnchor(null);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: { xs: 0.75, sm: 1.25 },
        px: { xs: 1, sm: 2 },
        py: { xs: 1, sm: 1.25 },
        borderRadius: 999,
        bgcolor: 'control.surface',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.06)',
        maxWidth: '100%',
      }}
    >
      <CircleButton
        title={!hasMic ? 'No microphone' : localAudioOn ? 'Turn off microphone' : 'Turn on microphone'}
        onClick={onToggleAudio}
        disabled={!hasMic}
        variant={localAudioOn ? 'idle' : 'danger'}
      >
        {localAudioOn ? <MicIcon /> : <MicOffIcon />}
      </CircleButton>

      <CircleButton
        title={localVideoOn ? 'Turn off camera' : 'Turn on camera'}
        onClick={onToggleVideo}
        variant={localVideoOn ? 'idle' : 'danger'}
      >
        {localVideoOn ? <VideocamIcon /> : <VideocamOffIcon />}
      </CircleButton>

      {/* Screen share — desktop only (getDisplayMedia is unreliable on mobile) */}
      {!isMobile && (
        <CircleButton
          title={isScreenSharing ? 'Stop presenting' : 'Present now'}
          onClick={onToggleShare}
          variant={isScreenSharing ? 'active' : 'idle'}
        >
          {isScreenSharing ? <StopPresentIcon /> : <PresentIcon />}
        </CircleButton>
      )}

      {/* Reactions — desktop inline; on mobile lives in the More menu */}
      {!isMobile && (
        <CircleButton title="Send a reaction" onClick={(e) => onReact(e.currentTarget)} variant="idle">
          <EmojiEmotionsIcon />
        </CircleButton>
      )}

      <CircleButton
        title={handRaised ? 'Lower hand' : 'Raise hand'}
        onClick={onToggleHand}
        variant={handRaised ? 'warning' : 'idle'}
      >
        <PanToolIcon />
      </CircleButton>

      <CircleButton
        title={showChat ? 'Hide chat' : 'Show chat'}
        onClick={onToggleChat}
        variant={showChat ? 'active' : 'idle'}
        badge={!showChat ? unreadCount : 0}
      >
        {showChat ? <ChatIcon /> : <ChatOutlineIcon />}
      </CircleButton>

      <Box ref={moreRef} sx={{ display: 'inline-flex' }}>
        <CircleButton title="More options" onClick={() => setMoreAnchor(moreRef.current)} variant="idle">
          <MoreVertIcon />
        </CircleButton>
      </Box>

      {/* End call — wider red pill, like Meet */}
      <Tooltip title="Leave call">
        <IconButton
          onClick={onLeave}
          sx={{
            ml: { xs: 0.25, sm: 0.5 },
            width: { xs: 58, sm: 76 },
            height: { xs: 44, sm: 50 },
            borderRadius: 999,
            bgcolor: 'error.main',
            color: '#fff',
            '&:hover': { bgcolor: 'error.dark' },
            '& svg': { fontSize: { xs: 22, sm: 24 } },
          }}
        >
          <CallEndIcon />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={moreAnchor}
        open={Boolean(moreAnchor)}
        onClose={closeMore}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { mb: 1, minWidth: 220 } } }}
      >
        {isMobile && (
          <MenuItem onClick={() => { closeMore(); onReact(moreRef.current); }}>
            <ListItemIcon><EmojiEmotionsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Send a reaction</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { closeMore(); onCopyLink(); }}>
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Copy joining link</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onToggleSound(); }}>
          <ListItemIcon>{soundEnabled ? <VolumeUpIcon fontSize="small" /> : <VolumeOffIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>Sound effects</ListItemText>
          <Box component="span" sx={{ ml: 2, color: 'text.secondary', fontSize: 13 }}>
            {soundEnabled ? 'On' : 'Off'}
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { closeMore(); onLeave(); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><CallEndIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
          <ListItemText>Leave call</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}

import { useRef, useState, type MouseEventHandler, type ReactNode } from 'react';
import {
  Badge, Box, Divider, IconButton, ListItemIcon, ListItemText,
  Menu, MenuItem, Popover as MuiPopover, Slider, Stack, Tooltip, Typography,
  useMediaQuery,
} from '@mui/material';
import {
  CallEnd as CallEndIcon,
  Chat as ChatIcon,
  ChatOutlined as ChatOutlineIcon,
  ClosedCaption as CaptionIcon,
  ClosedCaptionOff as CaptionOffIcon,
  ContentCopy as ContentCopyIcon,
  AutoAwesomeMosaic as AutoLayoutIcon,
  Check as CheckIcon,
  EmojiEmotions as EmojiEmotionsIcon,
  GridView as TiledIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  MoreVert as MoreVertIcon,
  PanTool as PanToolIcon,
  PeopleAlt as PeopleAltIcon,
  PhotoCamera as PhotoCameraIcon,
  PictureInPictureAlt as PipIcon,
  PresentToAll as PresentIcon,
  CancelPresentation as StopPresentIcon,
  Crop75 as SpotlightLayoutIcon,
  Tune as TuneIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
  ViewSidebar as SidebarLayoutIcon,
  ViewModule as LayoutIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
} from '@mui/icons-material';

const LAYOUTS = [
  { key: 'auto', label: 'Auto', Icon: AutoLayoutIcon },
  { key: 'tiled', label: 'Tiled', Icon: TiledIcon },
  { key: 'spotlight', label: 'Spotlight', Icon: SpotlightLayoutIcon },
  { key: 'sidebar', label: 'Sidebar', Icon: SidebarLayoutIcon },
] as const;

type LayoutMode = 'auto' | 'tiled' | 'spotlight' | 'sidebar';
type CircleVariant = 'idle' | 'danger' | 'active' | 'warning';
interface CircleButtonProps {
  title: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  variant?: CircleVariant;
  badge?: number;
  children: ReactNode;
}

export interface ControlBarProps {
  localAudioOn: boolean; hasMic: boolean; onToggleAudio: () => void;
  localVideoOn: boolean; onToggleVideo: () => void;
  isScreenSharing: boolean; onToggleShare: () => void;
  handRaised: boolean; onToggleHand: () => void;
  onReact: (anchor: HTMLElement | null) => void;
  showChat: boolean; unreadCount: number; onToggleChat: () => void;
  transcriptActive: boolean; transcriptAvailable: boolean; showTranscript: boolean; transcriptDisabled: boolean; onToggleTranscript: () => void;
  showPeople: boolean; peopleCount?: number; onTogglePeople: () => void;
  layoutMode?: LayoutMode; onLayoutChange: (mode: LayoutMode) => void;
  soundEnabled: boolean; onToggleSound: () => void;
  pipSupported: boolean; pipActive: boolean; onTogglePip: () => void;
  onCopyLink: () => void; onScreenshot: () => void; onLeave: () => void;
  micGain?: number; onMicGainChange: (value: number) => void;
  outputVolume?: number; onOutputVolumeChange: (value: number) => void;
  showPinToggle?: boolean; pinned?: boolean; onTogglePin?: () => void;
}

// One round control button. `variant` drives the Meet-style color states.
function CircleButton({ title, onClick, disabled = false, variant = 'idle', badge = 0, children }: CircleButtonProps) {
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
  transcriptActive, transcriptAvailable, showTranscript, transcriptDisabled, onToggleTranscript,
  showPeople, peopleCount = 0, onTogglePeople,
  layoutMode = 'auto', onLayoutChange,
  soundEnabled, onToggleSound,
  pipSupported, pipActive, onTogglePip,
  onCopyLink,
  onScreenshot,
  onLeave,
  micGain = 1, onMicGainChange,
  outputVolume = 1, onOutputVolumeChange,
  showPinToggle = false, pinned = false, onTogglePin,
}: ControlBarProps) {
  const isMobile = useMediaQuery((t) => t.breakpoints.down('sm'));
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [audioAnchor, setAudioAnchor] = useState<HTMLElement | null>(null);
  const [layoutAnchor, setLayoutAnchor] = useState<HTMLElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<HTMLButtonElement | null>(null);
  const layoutRef = useRef<HTMLButtonElement | null>(null);
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

      {!isMobile && (
        <CircleButton
          title={transcriptDisabled ? 'The meeting admin starts the shared transcript' : transcriptAvailable ? (showTranscript ? 'Hide transcript' : 'Show transcript') : 'Start shared transcript'}
          onClick={onToggleTranscript}
          disabled={transcriptDisabled}
          variant={transcriptActive ? 'active' : 'idle'}
        >
          {transcriptActive ? <CaptionIcon /> : <CaptionOffIcon />}
        </CircleButton>
      )}

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

      {/* People panel toggle */}
      {onTogglePeople && (
        <CircleButton
          title={showPeople ? 'Hide people' : 'Show people'}
          onClick={onTogglePeople}
          variant={showPeople ? 'active' : 'idle'}
          badge={peopleCount > 1 ? peopleCount : 0}
        >
          <PeopleAltIcon />
        </CircleButton>
      )}

      {/* Layout chooser — desktop only (irrelevant on a phone-sized stage) */}
      {!isMobile && (
        <Box ref={layoutRef} sx={{ display: 'inline-flex' }}>
          <CircleButton
            title="Change layout"
            onClick={() => setLayoutAnchor(layoutAnchor ? null : layoutRef.current)}
            variant={layoutAnchor ? 'active' : 'idle'}
          >
            <LayoutIcon />
          </CircleButton>
        </Box>
      )}

      {/* Audio settings (mic gain + speaker volume) — desktop inline; hidden on
          mobile, where it lives in the More menu instead so the bar stays
          uncluttered. On mobile the popover anchors to the More button (this box
          has no layout box while display:none) — see the More menu item below. */}
      <Box ref={audioRef} sx={{ display: isMobile ? 'none' : 'inline-flex' }}>
        <CircleButton
          title="Audio settings"
          onClick={() => setAudioAnchor(audioAnchor ? null : audioRef.current)}
          variant={audioAnchor ? 'active' : 'idle'}
        >
          <TuneIcon />
        </CircleButton>
      </Box>

      {/* Pin controls toggle (only during screen share) */}
      {showPinToggle && (
        <CircleButton
          title={pinned ? 'Auto-hide controls' : 'Keep controls visible'}
          onClick={onTogglePin}
          variant={pinned ? 'active' : 'idle'}
        >
          {pinned ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
        </CircleButton>
      )}

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

      {/* Audio settings popover */}
      <MuiPopover
        open={Boolean(audioAnchor)}
        anchorEl={audioAnchor}
        onClose={() => setAudioAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { mb: 1.5, p: 2.5, borderRadius: 3, minWidth: 240, bgcolor: 'control.surface', backdropFilter: 'blur(12px)' } } }}
      >
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
              Microphone volume
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <MicIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
              <Slider
                size="small"
                min={0} max={2} step={0.05}
                value={micGain}
                onChange={(_, v) => onMicGainChange?.(v)}
                sx={{ color: 'primary.main' }}
              />
              <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'right', color: 'text.secondary' }}>
                {Math.round(micGain * 100)}%
              </Typography>
            </Stack>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
              Speaker volume
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <VolumeUpIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
              <Slider
                size="small"
                min={0} max={1} step={0.05}
                value={outputVolume}
                onChange={(_, v) => onOutputVolumeChange?.(v)}
                sx={{ color: 'primary.main' }}
              />
              <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'right', color: 'text.secondary' }}>
                {Math.round(outputVolume * 100)}%
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </MuiPopover>

      {/* Layout chooser menu */}
      <Menu
        anchorEl={layoutAnchor}
        open={Boolean(layoutAnchor)}
        onClose={() => setLayoutAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { mb: 1, minWidth: 200 } } }}
      >
        {LAYOUTS.map(({ key, label, Icon }) => (
          <MenuItem
            key={key}
            selected={layoutMode === key}
            onClick={() => { onLayoutChange?.(key); setLayoutAnchor(null); }}
          >
            <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
            <ListItemText>{label}</ListItemText>
            {layoutMode === key && <CheckIcon fontSize="small" sx={{ ml: 2, color: 'primary.main' }} />}
          </MenuItem>
        ))}
      </Menu>

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
        {isMobile && (
          <MenuItem onClick={() => { closeMore(); setAudioAnchor(moreRef.current); }}>
            <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Audio settings</ListItemText>
          </MenuItem>
        )}
        {isMobile && (
          <MenuItem disabled={transcriptDisabled} onClick={() => { closeMore(); onToggleTranscript(); }}>
            <ListItemIcon>{transcriptActive ? <CaptionIcon fontSize="small" /> : <CaptionOffIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{transcriptAvailable ? 'Meeting transcript' : 'Start shared transcript'}</ListItemText>
          </MenuItem>
        )}
        {isMobile && <Divider />}
        <MenuItem onClick={() => { closeMore(); onCopyLink(); }}>
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Copy joining link</ListItemText>
        </MenuItem>
        {onScreenshot && (
          <MenuItem onClick={() => { closeMore(); onScreenshot(); }}>
            <ListItemIcon><PhotoCameraIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Take screenshot</ListItemText>
          </MenuItem>
        )}
        {pipSupported && (
          <MenuItem onClick={() => { closeMore(); onTogglePip(); }}>
            <ListItemIcon><PipIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{pipActive ? 'Close mini player' : 'Open mini player'}</ListItemText>
          </MenuItem>
        )}
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

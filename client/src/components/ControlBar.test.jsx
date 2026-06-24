import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme/theme';
import ControlBar from './ControlBar';

// ControlBar reads useMediaQuery to decide mobile vs desktop layout. jsdom has no
// matchMedia, so we stub it to "desktop" (matches: false) — the layout under test,
// where every inline control (screen share, reactions, layout chooser, transcript)
// is rendered rather than folded into the More menu.
beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

// Every handler ControlBar can invoke, plus sensible "default desktop" state.
// Tests override only the props relevant to the behavior they assert.
function makeProps(overrides = {}) {
  return {
    localAudioOn: true,
    hasMic: true,
    onToggleAudio: vi.fn(),
    localVideoOn: true,
    onToggleVideo: vi.fn(),
    isScreenSharing: false,
    onToggleShare: vi.fn(),
    handRaised: false,
    onToggleHand: vi.fn(),
    onReact: vi.fn(),
    showChat: false,
    unreadCount: 0,
    onToggleChat: vi.fn(),
    transcriptActive: false,
    transcriptAvailable: false,
    showTranscript: false,
    transcriptDisabled: false,
    onToggleTranscript: vi.fn(),
    showPeople: false,
    peopleCount: 1,
    onTogglePeople: vi.fn(),
    layoutMode: 'auto',
    onLayoutChange: vi.fn(),
    soundEnabled: true,
    onToggleSound: vi.fn(),
    pipSupported: false,
    pipActive: false,
    onTogglePip: vi.fn(),
    onCopyLink: vi.fn(),
    onScreenshot: vi.fn(),
    onLeave: vi.fn(),
    micGain: 1,
    onMicGainChange: vi.fn(),
    outputVolume: 1,
    onOutputVolumeChange: vi.fn(),
    ...overrides,
  };
}

function renderBar(overrides = {}) {
  const props = makeProps(overrides);
  render(
    <ThemeProvider theme={theme}>
      <ControlBar {...props} />
    </ThemeProvider>,
  );
  return props;
}

// Buttons carry no accessible name (icon-only, tooltip titles aren't exposed as
// names), so we locate a control by the icon that represents its current state —
// which icon is shown IS the user-observable behavior the toggles drive.
function buttonByIcon(testId) {
  return screen.getByTestId(testId).closest('button');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ControlBar', () => {
  describe('microphone toggle', () => {
    it('shows the live mic icon when audio is on and toggles on click', () => {
      const props = renderBar({ localAudioOn: true });

      expect(screen.getByTestId('MicIcon')).toBeInTheDocument();
      expect(screen.queryByTestId('MicOffIcon')).not.toBeInTheDocument();

      fireEvent.click(buttonByIcon('MicIcon'));
      expect(props.onToggleAudio).toHaveBeenCalledTimes(1);
    });

    it('shows the muted icon when audio is off', () => {
      renderBar({ localAudioOn: false });

      expect(screen.getByTestId('MicOffIcon')).toBeInTheDocument();
      expect(screen.queryByTestId('MicIcon')).not.toBeInTheDocument();
    });

    it('disables the mic control when there is no microphone', () => {
      const props = renderBar({ hasMic: false, localAudioOn: false });

      const micButton = buttonByIcon('MicOffIcon');
      expect(micButton).toBeDisabled();
      fireEvent.click(micButton);
      expect(props.onToggleAudio).not.toHaveBeenCalled();
    });
  });

  describe('camera toggle', () => {
    it('shows the live camera icon when video is on and toggles on click', () => {
      const props = renderBar({ localVideoOn: true });

      expect(screen.getByTestId('VideocamIcon')).toBeInTheDocument();

      fireEvent.click(buttonByIcon('VideocamIcon'));
      expect(props.onToggleVideo).toHaveBeenCalledTimes(1);
    });

    it('shows the camera-off icon when video is off', () => {
      renderBar({ localVideoOn: false });

      expect(screen.getByTestId('VideocamOffIcon')).toBeInTheDocument();
      expect(screen.queryByTestId('VideocamIcon')).not.toBeInTheDocument();
    });
  });

  describe('screen share', () => {
    it('shows the present icon when idle and invokes the share handler on click', () => {
      const props = renderBar({ isScreenSharing: false });

      expect(screen.getByTestId('PresentToAllIcon')).toBeInTheDocument();

      fireEvent.click(buttonByIcon('PresentToAllIcon'));
      expect(props.onToggleShare).toHaveBeenCalledTimes(1);
    });

    it('shows the stop-presenting icon while actively sharing', () => {
      renderBar({ isScreenSharing: true });

      expect(screen.getByTestId('CancelPresentationIcon')).toBeInTheDocument();
      expect(screen.queryByTestId('PresentToAllIcon')).not.toBeInTheDocument();
    });
  });

  describe('panel buttons', () => {
    it('chat: invokes the chat toggle and surfaces the unread badge when hidden', () => {
      const props = renderBar({ showChat: false, unreadCount: 3 });

      // Unread count is visible as a badge while the chat panel is hidden.
      expect(screen.getByText('3')).toBeInTheDocument();

      fireEvent.click(buttonByIcon('ChatOutlinedIcon'));
      expect(props.onToggleChat).toHaveBeenCalledTimes(1);
    });

    it('chat: hides the unread badge when the panel is already open', () => {
      renderBar({ showChat: true, unreadCount: 3 });

      expect(screen.queryByText('3')).not.toBeInTheDocument();
      // Open-state icon is shown instead of the outlined one.
      expect(screen.getByTestId('ChatIcon')).toBeInTheDocument();
    });

    it('people: invokes the people toggle on click', () => {
      const props = renderBar();

      fireEvent.click(buttonByIcon('PeopleAltIcon'));
      expect(props.onTogglePeople).toHaveBeenCalledTimes(1);
    });

    it('transcript: invokes the transcript toggle on click', () => {
      const props = renderBar({ transcriptActive: false, transcriptDisabled: false });

      fireEvent.click(buttonByIcon('ClosedCaptionOffIcon'));
      expect(props.onToggleTranscript).toHaveBeenCalledTimes(1);
    });
  });

  describe('layout chooser', () => {
    it('opens the layout menu and invokes onLayoutChange with the chosen layout', () => {
      const props = renderBar({ layoutMode: 'auto' });

      // Menu is closed initially.
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      fireEvent.click(buttonByIcon('ViewModuleIcon'));

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('Auto')).toBeInTheDocument();
      expect(within(menu).getByText('Tiled')).toBeInTheDocument();
      expect(within(menu).getByText('Spotlight')).toBeInTheDocument();
      expect(within(menu).getByText('Sidebar')).toBeInTheDocument();

      fireEvent.click(within(menu).getByText('Spotlight'));
      expect(props.onLayoutChange).toHaveBeenCalledWith('spotlight');
    });
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme/theme';
import ControlBar from './ControlBar';
import type { ControlBarProps } from './ControlBar';

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
function makeProps(overrides: Partial<ControlBarProps> = {}): ControlBarProps {
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
    forcedMuteCount: 0,
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

// Each control is an icon-only button whose accessible name comes from its MUI
// Tooltip title, so we locate it by that user-facing label — the control-bar
// contract — rather than by icon internals.
const btn = (name: string) => screen.getByRole('button', { name });
const queryBtn = (name: string) => screen.queryByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ControlBar', () => {
  describe('microphone toggle', () => {
    it('exposes the "turn off" control when audio is on and toggles on click', () => {
      const props = renderBar({ localAudioOn: true });

      expect(btn('Turn off microphone')).toBeInTheDocument();
      expect(queryBtn('Turn on microphone')).not.toBeInTheDocument();

      fireEvent.click(btn('Turn off microphone'));
      expect(props.onToggleAudio).toHaveBeenCalledTimes(1);
    });

    it('exposes the "turn on" control when audio is muted', () => {
      renderBar({ localAudioOn: false });

      expect(btn('Turn on microphone')).toBeInTheDocument();
      expect(queryBtn('Turn off microphone')).not.toBeInTheDocument();
    });

    it('disables the mic control when there is no microphone', () => {
      const props = renderBar({ hasMic: false, localAudioOn: false });

      // A disabled control can't host the Tooltip directly, so its "No microphone"
      // label sits on the wrapping region; the button inside it is non-interactive.
      const micButton = within(screen.getByLabelText('No microphone')).getByRole('button');
      expect(micButton).toBeDisabled();
      fireEvent.click(micButton);
      expect(props.onToggleAudio).not.toHaveBeenCalled();
    });
  });

  describe('camera toggle', () => {
    it('exposes the "turn off" control when video is on and toggles on click', () => {
      const props = renderBar({ localVideoOn: true });

      expect(btn('Turn off camera')).toBeInTheDocument();

      fireEvent.click(btn('Turn off camera'));
      expect(props.onToggleVideo).toHaveBeenCalledTimes(1);
    });

    it('exposes the "turn on" control when video is off', () => {
      renderBar({ localVideoOn: false });

      expect(btn('Turn on camera')).toBeInTheDocument();
      expect(queryBtn('Turn off camera')).not.toBeInTheDocument();
    });
  });

  describe('screen share', () => {
    it('offers "present now" when idle and invokes the share handler on click', () => {
      const props = renderBar({ isScreenSharing: false });

      expect(btn('Present now')).toBeInTheDocument();

      fireEvent.click(btn('Present now'));
      expect(props.onToggleShare).toHaveBeenCalledTimes(1);
    });

    it('offers "stop presenting" while actively sharing', () => {
      renderBar({ isScreenSharing: true });

      expect(btn('Stop presenting')).toBeInTheDocument();
      expect(queryBtn('Present now')).not.toBeInTheDocument();
    });
  });

  describe('panel buttons', () => {
    it('chat: invokes the chat toggle and surfaces the unread badge when hidden', () => {
      const props = renderBar({ showChat: false, unreadCount: 3 });

      // Unread count is visible as a badge while the chat panel is hidden.
      expect(screen.getByText('3')).toBeInTheDocument();

      fireEvent.click(btn('Show chat'));
      expect(props.onToggleChat).toHaveBeenCalledTimes(1);
    });

    it('chat: hides the unread badge when the panel is already open', () => {
      renderBar({ showChat: true, unreadCount: 3 });

      expect(screen.queryByText('3')).not.toBeInTheDocument();
      // Open state exposes the "hide chat" control instead.
      expect(btn('Hide chat')).toBeInTheDocument();
    });

    it('people: invokes the people toggle on click', () => {
      const props = renderBar({ showPeople: false });

      fireEvent.click(btn('Show people'));
      expect(props.onTogglePeople).toHaveBeenCalledTimes(1);
    });

    it('transcript: invokes the transcript toggle on click', () => {
      const props = renderBar({ transcriptAvailable: false, transcriptDisabled: false });

      fireEvent.click(btn('Start shared transcript'));
      expect(props.onToggleTranscript).toHaveBeenCalledTimes(1);
    });

  });

  describe('layout chooser', () => {
    it('opens the layout menu and invokes onLayoutChange with the chosen layout', () => {
      const props = renderBar({ layoutMode: 'auto' });

      // Menu is closed initially.
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      fireEvent.click(btn('Change layout'));

      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('Auto')).toBeInTheDocument();
      expect(within(menu).getByText('Tiled')).toBeInTheDocument();
      expect(within(menu).getByText('Spotlight')).toBeInTheDocument();
      expect(within(menu).getByText('Sidebar')).toBeInTheDocument();

      fireEvent.click(within(menu).getByText('Spotlight'));
      expect(props.onLayoutChange).toHaveBeenCalledWith('spotlight');
    });
  });

  // A11y baseline (#164): toggles expose pressed state, menu triggers expose
  // popup/expanded state, and local state flips are narrated via a polite
  // live region — the contract screen readers depend on.
  describe('accessibility', () => {
    function renderRerenderable(overrides: Partial<ControlBarProps> = {}) {
      const view = render(
        <ThemeProvider theme={theme}>
          <ControlBar {...makeProps(overrides)} />
        </ThemeProvider>,
      );
      const update = (next: Partial<ControlBarProps>) =>
        view.rerender(
          <ThemeProvider theme={theme}>
            <ControlBar {...makeProps(next)} />
          </ThemeProvider>,
        );
      return { update };
    }

    it('exposes transcript pressed state only when toggling panel visibility', () => {
      const { update } = renderRerenderable({
        transcriptActive: true,
        transcriptAvailable: true,
        showTranscript: false,
      });
      expect(btn('Show transcript')).toHaveAttribute('aria-pressed', 'false');

      update({ transcriptActive: true, transcriptAvailable: true, showTranscript: true });
      expect(btn('Hide transcript')).toHaveAttribute('aria-pressed', 'true');

      update({ transcriptActive: false, transcriptAvailable: false, showTranscript: false });
      expect(btn('Start shared transcript')).not.toHaveAttribute('aria-pressed');
    });

    it('exposes aria-pressed on the mic toggle matching the live/muted state', () => {
      const { update } = renderRerenderable({ localAudioOn: true });
      expect(btn('Turn off microphone')).toHaveAttribute('aria-pressed', 'true');

      update({ localAudioOn: false });
      expect(btn('Turn on microphone')).toHaveAttribute('aria-pressed', 'false');
    });

    it('exposes aria-pressed on camera, hand, screen-share, chat and people toggles', () => {
      renderBar({ localVideoOn: false, handRaised: true, isScreenSharing: true, showChat: true, showPeople: false });

      expect(btn('Turn on camera')).toHaveAttribute('aria-pressed', 'false');
      expect(btn('Lower hand')).toHaveAttribute('aria-pressed', 'true');
      expect(btn('Stop presenting')).toHaveAttribute('aria-pressed', 'true');
      expect(btn('Hide chat')).toHaveAttribute('aria-pressed', 'true');
      expect(btn('Show people')).toHaveAttribute('aria-pressed', 'false');
    });

    it('marks the layout chooser as a menu trigger and reflects expanded state', () => {
      renderBar();

      const layoutBtn = btn('Change layout');
      expect(layoutBtn).toHaveAttribute('aria-haspopup', 'menu');
      expect(layoutBtn).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(layoutBtn);
      // While the menu is open MUI hides the background from assistive tech,
      // so re-query including hidden elements to check the trigger's state.
      expect(screen.getByRole('button', { name: 'Change layout', hidden: true })).toHaveAttribute('aria-expanded', 'true');
    });

    it('marks More options and Audio settings as popup triggers', () => {
      renderBar();

      expect(btn('More options')).toHaveAttribute('aria-haspopup', 'menu');
      const audioSettings = btn('Audio settings');
      expect(audioSettings).toHaveAttribute('aria-haspopup', 'dialog');

      fireEvent.click(audioSettings);
      expect(screen.getByRole('dialog', { name: 'Audio settings' })).toBeInTheDocument();
    });

    it('announces microphone state changes through a polite live region', () => {
      const { update } = renderRerenderable({ localAudioOn: true });
      const region = screen.getByRole('status');
      expect(region).toHaveTextContent('');

      update({ localAudioOn: false });
      expect(region).toHaveTextContent('Microphone muted');

      update({ localAudioOn: true });
      expect(region).toHaveTextContent('Microphone on');
    });

    it('does not duplicate the notification for a host-forced mute', () => {
      const { update } = renderRerenderable({ localAudioOn: true, forcedMuteCount: 0 });

      update({ localAudioOn: false, forcedMuteCount: 1 });
      expect(screen.getByRole('status')).not.toHaveTextContent('Microphone muted');

      update({ localAudioOn: true, forcedMuteCount: 1 });
      update({ localAudioOn: false, forcedMuteCount: 1 });
      expect(screen.getByRole('status')).toHaveTextContent('Microphone muted');
    });

    it('announces raise-hand and screen-share changes', () => {
      const { update } = renderRerenderable({ handRaised: false, isScreenSharing: false });

      update({ handRaised: true, isScreenSharing: false });
      expect(screen.getByRole('status')).toHaveTextContent('Hand raised');

      update({ handRaised: true, isScreenSharing: true });
      expect(screen.getByRole('status')).toHaveTextContent('Presenting your screen');
    });
  });
});

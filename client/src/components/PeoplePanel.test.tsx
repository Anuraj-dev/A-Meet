import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme/theme';
import PeoplePanel from './PeoplePanel';

// PeoplePanel uses responsive sx but no useMediaQuery branch in its logic; jsdom
// still lacks matchMedia, so stub it defensively for any MUI internals.
let isMobile = false;

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isMobile,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

// A small, deterministic roster. `id` is the socketId the handlers receive.
function people() {
  return [
    { id: 'me', name: 'Ada', avatar: '', audioOn: true, videoOn: true, isLocal: true, isHost: true },
    { id: 'bob', name: 'Bob', avatar: '', audioOn: true, videoOn: false, isLocal: false },
    { id: 'cara', name: 'Cara', avatar: '', audioOn: false, videoOn: true, isLocal: false },
  ];
}

function renderPanel(overrides = {}) {
  const props = {
    people: people(),
    currentUserIsHost: false,
    onClose: vi.fn(),
    onPin: vi.fn(),
    onSpotlight: vi.fn(),
    onMute: vi.fn(),
    onAskUnmute: vi.fn(),
    onRemove: vi.fn(),
    onMuteAll: vi.fn(),
    onAskUnmuteAll: vi.fn(),
    ...overrides,
  };
  render(
    <ThemeProvider theme={theme}>
      <PeoplePanel {...props} />
    </ThemeProvider>,
  );
  return props;
}

// Open the per-person moderation menu via its accessible label.
function openMenuFor(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `More actions for ${name}` }));
  return screen.getByRole('menu');
}

beforeEach(() => {
  vi.clearAllMocks();
  isMobile = false;
});

describe('PeoplePanel', () => {
  describe('search filter', () => {
    it('narrows the rendered list to participants matching the query', () => {
      renderPanel();

      // All three are present initially.
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Cara')).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText('Search people'), { target: { value: 'car' } });

      expect(screen.getByText('Cara')).toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
      expect(screen.queryByText(/^Ada/)).not.toBeInTheDocument();
    });

    it('shows an empty-state message when nothing matches', () => {
      renderPanel();

      fireEvent.change(screen.getByPlaceholderText('Search people'), { target: { value: 'zzz' } });

      expect(screen.getByText(/No one matches/)).toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });
  });

  describe('per-person status', () => {
    it('renders a camera-off indicator for a participant with video off', () => {
      // Bob has videoOn:false; Cara has videoOn:true → exactly one indicator.
      renderPanel();
      expect(screen.getByRole('img', { name: 'Camera off' })).toBeInTheDocument();
    });

    it('renders a microphone-off indicator for a muted participant', () => {
      // Cara has audioOn:false → muted indicator; nobody else is muted.
      renderPanel();
      expect(screen.getByRole('img', { name: 'Microphone off' })).toBeInTheDocument();
    });

    it('does not render a muted indicator when everyone has audio on', () => {
      renderPanel({
        people: [
          { id: 'bob', name: 'Bob', audioOn: true, videoOn: true, isLocal: false },
        ],
      });
      expect(screen.queryByRole('img', { name: 'Microphone off' })).not.toBeInTheDocument();
    });
  });

  describe('host moderation actions', () => {
    it('invokes onMute with the target peer when the host mutes someone', () => {
      const props = renderPanel({ currentUserIsHost: true });

      const menu = openMenuFor('Bob'); // Bob has audioOn:true → "Mute" is offered
      fireEvent.click(within(menu).getByText('Mute'));

      expect(props.onMute).toHaveBeenCalledTimes(1);
      expect(props.onMute).toHaveBeenCalledWith(expect.objectContaining({ id: 'bob' }));
    });

    it('invokes onRemove with the target peer when the host removes someone', () => {
      const props = renderPanel({ currentUserIsHost: true });

      const menu = openMenuFor('Bob');
      fireEvent.click(within(menu).getByText('Remove from call'));

      expect(props.onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'bob' }));
    });

    it('offers spotlight-for-everyone to the host', () => {
      const props = renderPanel({ currentUserIsHost: true });

      const menu = openMenuFor('Bob');
      fireEvent.click(within(menu).getByText('Spotlight for everyone'));

      expect(props.onSpotlight).toHaveBeenCalledWith(expect.objectContaining({ id: 'bob' }));
    });
  });

  describe('pin (available to any user)', () => {
    it('invokes onPin with the target peer', () => {
      const props = renderPanel({ currentUserIsHost: false });

      const menu = openMenuFor('Bob');
      fireEvent.click(within(menu).getByText('Pin for me'));

      expect(props.onPin).toHaveBeenCalledWith(expect.objectContaining({ id: 'bob' }));
    });
  });

  describe('non-host view', () => {
    it('does not expose host moderation actions to a non-host', () => {
      renderPanel({ currentUserIsHost: false });

      const menu = openMenuFor('Bob');
      // Pin is available to everyone...
      expect(within(menu).getByText('Pin for me')).toBeInTheDocument();
      // ...but host-only controls are absent.
      expect(within(menu).queryByText('Mute')).not.toBeInTheDocument();
      expect(within(menu).queryByText('Remove from call')).not.toBeInTheDocument();
      expect(within(menu).queryByText('Spotlight for everyone')).not.toBeInTheDocument();
    });

    it('hides the host bulk Mute-all action from a non-host', () => {
      renderPanel({ currentUserIsHost: false });
      expect(screen.queryByRole('button', { name: /Mute all/ })).not.toBeInTheDocument();
    });

    it('shows the host bulk Mute-all action to the host', () => {
      renderPanel({ currentUserIsHost: true });
      expect(screen.getByRole('button', { name: /Mute all/ })).toBeInTheDocument();
    });
  });

  // A11y baseline (#164): the panel is a labeled dialog that receives focus on
  // open and closes on Escape (focus-return behavior shares usePanelDialog with
  // ChatPanel, where it is covered in depth).
  describe('accessibility', () => {
    it('makes the mobile bottom sheet modal to background content', () => {
      isMobile = true;
      render(
        <>
          <button>Background control</button>
          <ThemeProvider theme={theme}>
            <PeoplePanel people={people()} onClose={vi.fn()} />
          </ThemeProvider>
        </>,
      );

      const background = screen.getByRole('button', { name: 'Background control', hidden: true });
      expect(background.closest('[aria-hidden="true"]')).not.toBeNull();
      const dialog = screen.getByRole('dialog', { name: 'People' });
      background.focus();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });

    it('is exposed as a dialog named "People" and moves focus inside on open', () => {
      renderPanel();

      const dialog = screen.getByRole('dialog', { name: 'People' });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect(screen.getByRole('heading', { name: /People/ })).not.toHaveStyle({ outline: 'none' });
    });

    it('closes when Escape is pressed inside the panel', () => {
      const props = renderPanel();

      fireEvent.keyDown(screen.getByRole('dialog', { name: 'People' }), { key: 'Escape' });
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps the panel open when Escape is pressed while a person-actions menu is open', () => {
      const props = renderPanel();
      openMenuFor('Bob');

      fireEvent.keyDown(screen.getByRole('dialog', { name: 'People', hidden: true }), { key: 'Escape' });

      expect(props.onClose).not.toHaveBeenCalled();
    });
  });
});

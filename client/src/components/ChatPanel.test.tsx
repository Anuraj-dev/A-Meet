import { useState, type FormEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme/theme';
import ChatPanel, { type ChatMessage } from './ChatPanel';

// ChatPanel uses responsive sx but no useMediaQuery branch in its logic; jsdom
// still lacks matchMedia, so stub it defensively for any MUI internals.
beforeAll(() => {
  // jsdom doesn't implement scrollIntoView, which ChatPanel calls to keep the
  // latest message in view; stub it so the auto-scroll effect is a no-op.
  Element.prototype.scrollIntoView = vi.fn();
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

// ChatPanel is fully controlled (input/setInput/onSend come from the parent, which
// also clears the input on send). This harness mirrors RoomPage's real wiring so
// tests exercise the true contract: onSend reads the current input, then clears it.
interface HarnessProps { onSendSpy?: ReturnType<typeof vi.fn>; messages?: ChatMessage[]; currentUserId?: string; onClose?: ReturnType<typeof vi.fn> }
function Harness({ onSendSpy = vi.fn(), messages = [], currentUserId = 'me', onClose = vi.fn() }: HarnessProps) {
  const [input, setInput] = useState('');
  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendSpy(input);
    setInput('');
  };
  return (
    <ThemeProvider theme={theme}>
      <ChatPanel
        messages={messages}
        input={input}
        setInput={setInput}
        onSend={handleSend}
        currentUserId={currentUserId}
        onClose={onClose}
      />
    </ThemeProvider>
  );
}

const composer = () => screen.getByPlaceholderText('Send a message to everyone');
const sendButton = () => screen.getByRole('button', { name: 'Send message' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChatPanel', () => {
  describe('rendering messages', () => {
    it('shows a received message with its author and text', () => {
      render(
        <Harness
          currentUserId="me"
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: 'Hi everyone', ts: Date.now() },
          ]}
        />,
      );

      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Hi everyone')).toBeInTheDocument();
    });

    it('shows my own message text', () => {
      render(
        <Harness
          currentUserId="me"
          messages={[
            { sender: { id: 'me', name: 'Me' }, text: 'On my way', ts: Date.now() },
          ]}
        />,
      );

      expect(screen.getByText('On my way')).toBeInTheDocument();
    });

    it('renders an event/system message as a labeled chip', () => {
      render(
        <Harness messages={[{ type: 'event', text: 'Bob joined the call', ts: Date.now() }]} />,
      );

      expect(screen.getByText('Bob joined the call')).toBeInTheDocument();
    });

    it('renders identical id-less messages without duplicate React keys', () => {
      // Two messages with the same sender, text, and millisecond timestamp —
      // the worst case for any content-derived key.
      const ts = Date.now();
      const twin = (): ChatMessage => ({
        type: 'chat', text: 'same', ts, sender: { id: 'u1', name: 'Alice' },
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<Harness messages={[twin(), twin()]} />);

      expect(screen.getAllByText('same')).toHaveLength(2);
      const duplicateKeyWarning = errorSpy.mock.calls.some((args) =>
        args.some((a) => typeof a === 'string' && a.includes('same key')));
      expect(duplicateKeyWarning).toBe(false);
      errorSpy.mockRestore();
    });

    it('shows the empty-state prompt when there are no messages', () => {
      render(<Harness messages={[]} />);

      expect(screen.getByText(/Say hello/)).toBeInTheDocument();
    });
  });

  describe('sending a message', () => {
    it('invokes the send handler with the typed text and clears the input', () => {
      const onSendSpy = vi.fn();
      render(<Harness messages={[]} onSendSpy={onSendSpy} />);

      fireEvent.change(composer(), { target: { value: 'Hello team' } });
      expect(composer()).toHaveValue('Hello team');

      fireEvent.click(sendButton());

      expect(onSendSpy).toHaveBeenCalledTimes(1);
      expect(onSendSpy).toHaveBeenCalledWith('Hello team');
      // Parent clears the controlled input after send.
      expect(composer()).toHaveValue('');
    });
  });

  describe('empty / whitespace guard', () => {
    it('disables the send button and does not send when the input is empty', () => {
      const onSendSpy = vi.fn();
      render(<Harness messages={[]} onSendSpy={onSendSpy} />);

      expect(sendButton()).toBeDisabled();
      fireEvent.click(sendButton());
      expect(onSendSpy).not.toHaveBeenCalled();
    });

    it('keeps the send button disabled for whitespace-only input', () => {
      const onSendSpy = vi.fn();
      render(<Harness messages={[]} onSendSpy={onSendSpy} />);

      fireEvent.change(composer(), { target: { value: '   ' } });

      expect(sendButton()).toBeDisabled();
      fireEvent.click(sendButton());
      expect(onSendSpy).not.toHaveBeenCalled();
    });
  });

  describe('closing the panel', () => {
    it('invokes onClose when the close button is clicked', () => {
      const onClose = vi.fn();
      render(<Harness messages={[]} onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

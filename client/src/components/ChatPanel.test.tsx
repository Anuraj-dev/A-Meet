import { useState, type FormEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme/theme';
import ChatPanel, { type ChatMessage } from './ChatPanel';

// ChatPanel uses responsive sx but no useMediaQuery branch in its logic; jsdom
// still lacks matchMedia, so stub it defensively for any MUI internals.
let isMobile = false;

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView, which ChatPanel calls to keep the
  // latest message in view; stub it so the auto-scroll effect is a no-op.
  Element.prototype.scrollIntoView = vi.fn();
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

type ChatAck = { ok: true } | { ok: false; code: string; message: string };
type AckCallback = (error: Error | null, response?: ChatAck) => void;

// ChatPanel is fully controlled. This harness mirrors RoomPage's acked send
// contract: the send remains pending until the callback settles, then only a
// successful acknowledgement may clear the original draft.
interface HarnessProps { onSendSpy?: (input: string, ack: AckCallback) => void; messages?: ChatMessage[]; currentUserId?: string; onClose?: () => void }
function Harness({ onSendSpy = vi.fn(), messages = [], currentUserId = 'me', onClose = vi.fn() }: HarnessProps) {
  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const sentText = input;
    setSending(true);
    onSendSpy(sentText, (error, response) => {
      setSending(false);
      if (error) {
        setSendError("Couldn't send — try again");
        return;
      }
      if (response?.ok) {
        setInput((current) => current === sentText ? '' : current);
        setSendError('');
        return;
      }
      setSendError(response?.message ?? "Couldn't send — try again");
    });
  };
  return (
    <ThemeProvider theme={theme}>
      <ChatPanel
        messages={messages}
        input={input}
        setInput={(value) => { setInput(value); setSendError(''); }}
        onSend={handleSend}
        sendError={sendError}
        sending={sending}
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
  isMobile = false;
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
    it('clears the composer after an ok acknowledgement', () => {
      const onSendSpy = vi.fn((_input, ack: AckCallback) => ack(null, { ok: true }));
      render(<Harness messages={[]} onSendSpy={onSendSpy} />);

      fireEvent.change(composer(), { target: { value: 'Hello team' } });
      expect(composer()).toHaveValue('Hello team');

      fireEvent.click(sendButton());

      expect(onSendSpy).toHaveBeenCalledTimes(1);
      expect(onSendSpy.mock.calls[0][0]).toBe('Hello team');
      expect(composer()).toHaveValue('');
    });

    it('keeps an over-limit draft, blocks send, and shows its error and counter', () => {
      const onSendSpy = vi.fn();
      render(<Harness messages={[]} onSendSpy={onSendSpy} />);
      const overLimit = 'x'.repeat(16_001);

      fireEvent.change(composer(), { target: { value: overLimit } });

      expect(composer()).toHaveValue(overLimit);
      expect(screen.getByText('16001 / 16000')).toBeInTheDocument();
      expect(screen.getByText(/Messages can be at most 16000 characters/i)).toBeInTheDocument();
      expect(sendButton()).toBeDisabled();
      fireEvent.click(sendButton());
      expect(onSendSpy).not.toHaveBeenCalled();
    });

    it('keeps the draft and shows the server message when the acknowledgement rejects', () => {
      const onSendSpy = vi.fn((_input, ack: AckCallback) => ack(null, {
        ok: false,
        code: 'MESSAGE_TOO_LONG',
        message: 'Messages can be at most 16000 characters.',
      }));
      render(<Harness messages={[]} onSendSpy={onSendSpy} />);

      fireEvent.change(composer(), { target: { value: 'A draft to revise' } });
      fireEvent.click(sendButton());

      expect(composer()).toHaveValue('A draft to revise');
      expect(screen.getByText('Messages can be at most 16000 characters.')).toBeInTheDocument();
    });

    it('keeps the draft and offers a retry when the acknowledgement times out', () => {
      const onSendSpy = vi.fn((_input, ack: AckCallback) => ack(new Error('operation has timed out')));
      render(<Harness messages={[]} onSendSpy={onSendSpy} />);

      fireEvent.change(composer(), { target: { value: 'A draft to retry' } });
      fireEvent.click(sendButton());

      expect(composer()).toHaveValue('A draft to retry');
      expect(screen.getByText("Couldn't send — try again")).toBeInTheDocument();
      expect(sendButton()).toBeEnabled();
    });

    it('disables repeat sends while awaiting an acknowledgement and preserves a newer draft', () => {
      let acknowledge: AckCallback | undefined;
      const onSendSpy = vi.fn((_input, ack: AckCallback) => { acknowledge = ack; });
      render(<Harness messages={[]} onSendSpy={onSendSpy} />);

      fireEvent.change(composer(), { target: { value: 'first' } });
      fireEvent.click(sendButton());

      expect(sendButton()).toBeDisabled();
      fireEvent.change(composer(), { target: { value: 'second' } });
      fireEvent.click(sendButton());
      expect(onSendSpy).toHaveBeenCalledTimes(1);

      acknowledge?.(null, { ok: true });
      expect(composer()).toHaveValue('second');
    });

    it('shows the character counter only after 14,000 characters', () => {
      render(<Harness messages={[]} />);

      fireEvent.change(composer(), { target: { value: 'x'.repeat(14_000) } });
      expect(screen.queryByText('14000 / 16000')).not.toBeInTheDocument();

      fireEvent.change(composer(), { target: { value: 'x'.repeat(14_001) } });
      expect(screen.getByText('14001 / 16000')).toBeInTheDocument();
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

  // A11y baseline (#164): the panel is a labeled dialog that receives focus on
  // open, closes on Escape, and returns focus to the invoking control on close.
  describe('accessibility', () => {
    it('makes the mobile bottom sheet modal to background content', () => {
      isMobile = true;
      render(
        <>
          <button>Background control</button>
          <Harness messages={[]} />
        </>,
      );

      const background = screen.getByRole('button', { name: 'Background control', hidden: true });
      expect(background.closest('[aria-hidden="true"]')).not.toBeNull();
      const dialog = screen.getByRole('dialog', { name: 'In-call messages' });
      background.focus();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });

    it('is exposed as a dialog named "In-call messages" and moves focus inside on open', () => {
      render(<Harness messages={[]} />);

      const dialog = screen.getByRole('dialog', { name: 'In-call messages' });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect(screen.getByRole('heading', { name: 'In-call messages' })).not.toHaveStyle({ outline: 'none' });
    });

    it('closes when Escape is pressed inside the panel', () => {
      const onClose = vi.fn();
      render(<Harness messages={[]} onClose={onClose} />);

      fireEvent.keyDown(screen.getByRole('dialog', { name: 'In-call messages' }), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('returns focus to the control that opened it when the panel unmounts', () => {
      function Wrapper() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button onClick={() => setOpen(true)}>Show chat</button>
            {open && <button onClick={() => setOpen(false)}>unmount</button>}
            {open && <Harness messages={[]} />}
          </>
        );
      }
      render(<Wrapper />);

      const opener = screen.getByRole('button', { name: 'Show chat' });
      opener.focus();
      fireEvent.click(opener);
      // Panel took focus on open…
      expect(screen.getByRole('dialog', { name: 'In-call messages' })).toContainElement(document.activeElement as HTMLElement);

      fireEvent.click(screen.getByRole('button', { name: 'unmount' }));
      // …and hands it back on close.
      expect(opener).toHaveFocus();
    });

    it('exposes the message history as a log region for polite announcements', () => {
      render(<Harness messages={[{ sender: { id: 'bob', name: 'Bob' }, text: 'Hi', ts: Date.now() }]} />);

      expect(screen.getByRole('log', { name: 'Chat messages' })).toBeInTheDocument();
    });
  });
});

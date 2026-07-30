import { useState, type FormEvent } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme/theme';
import ChatPanel, { type ChatMessage } from './ChatPanel';

/** Manually settled promise — drives out-of-order clipboard races in tests. */
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

  // Copy affordance on every chat bubble (#193): copies canonical payload text
  // via the async clipboard API; hover/focus reveal is CSS (not unit-tested here).
  describe('copy message', () => {
    const fullText = [
      'Line one of a long paste',
      'Line two with more detail',
      'Trailing content that must survive copy intact',
    ].join('\n');

    function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
    }

    it('names the copy action with the message sender', () => {
      render(
        <Harness
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: 'Hi everyone', ts: Date.now() },
          ]}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'Copy message from Bob' }),
      ).toBeInTheDocument();
    });

    it('copies the full canonical message text to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      mockClipboard(writeText);

      render(
        <Harness
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: fullText, ts: Date.now() },
          ]}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Copy message from Bob' }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1);
      });
      expect(writeText).toHaveBeenCalledWith(fullText);
    });

    it('shows success feedback after a successful copy', async () => {
      mockClipboard(vi.fn().mockResolvedValue(undefined));

      render(
        <Harness
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: 'Snippet to grab', ts: Date.now() },
          ]}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Copy message from Bob' }));

      // Success must be announced/visible — name flips so assistive tech hears it.
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    it('shows a distinct failure state when clipboard write fails', async () => {
      mockClipboard(vi.fn().mockRejectedValue(new Error('denied')));

      render(
        <Harness
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: 'Cannot copy this', ts: Date.now() },
          ]}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Copy message from Bob' }));

      // Failure must never look like success.
      expect(await screen.findByRole('button', { name: /couldn.?t copy/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
    });

    it('does not put a copy control on system event messages', () => {
      render(
        <Harness messages={[{ type: 'event', text: 'Bob joined the call', ts: Date.now() }]} />,
      );

      expect(screen.queryByRole('button', { name: /copy message/i })).not.toBeInTheDocument();
    });

    it('ignores a stale clipboard settlement after a newer copy completes', async () => {
      // A starts first (slow reject) then B (fast resolve). B must keep "Copied"
      // when A's late failure settles — stale feedback must not overwrite.
      const first = deferred<void>();
      const second = deferred<void>();
      let call = 0;
      const writeText = vi.fn().mockImplementation(() => {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      });
      mockClipboard(writeText);

      render(
        <Harness
          messages={[
            { sender: { id: 'a', name: 'Alice' }, text: 'slow fail', ts: Date.now() },
            { sender: { id: 'b', name: 'Bob' }, text: 'fast ok', ts: Date.now() + 1 },
          ]}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Copy message from Alice' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy message from Bob' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));

      await act(async () => {
        second.resolve();
      });
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy message from Alice' })).toBeInTheDocument();

      await act(async () => {
        first.reject(new Error('denied'));
      });

      // Stale rejection must not flip feedback to failure on either row.
      expect(screen.queryByRole('button', { name: /couldn.?t copy/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy message from Alice' })).toBeInTheDocument();
    });

    it('ignores clipboard settlement after the panel unmounts', async () => {
      // Late writeText resolve must not re-arm feedback state/timer post-unmount.
      const pending = deferred<void>();
      mockClipboard(vi.fn().mockReturnValue(pending.promise));
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      const { unmount } = render(
        <Harness
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: 'pending copy', ts: Date.now() },
          ]}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Copy message from Bob' }));
      unmount();
      const timeoutsBeforeSettle = setTimeoutSpy.mock.calls.length;

      // Settling after unmount must be a no-op (no throw, no orphaned feedback timer).
      await act(async () => {
        pending.resolve();
      });

      expect(screen.queryByRole('dialog', { name: 'In-call messages' })).not.toBeInTheDocument();
      // showCopyFeedback schedules a 1.8s clear — must not re-arm after unmount.
      const rearmed = setTimeoutSpy.mock.calls
        .slice(timeoutsBeforeSettle)
        .some((args) => args[1] === 1800);
      expect(rearmed).toBe(false);
      setTimeoutSpy.mockRestore();
    });
  });

  // Long-message rendering (#196): pre-wrap newlines; collapse past ~800 chars
  // or ~12 lines with session-local Show more / Show less; copy always full text.
  describe('long-message rendering', () => {
    const longByChars = 'x'.repeat(801);
    const longByLines = Array.from({ length: 13 }, (_, i) => `line ${i + 1}`).join('\n');
    const shortMultiline = 'First line\nSecond line\nThird line';

    it('preserves newlines with pre-wrap so multi-line text does not collapse', () => {
      render(
        <Harness
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: shortMultiline, ts: Date.now() },
          ]}
        />,
      );

      // Match the text node host (not a parent that also has the same textContent).
      const bubbleText = screen.getByText((_, el) =>
        el?.tagName === 'P' && el.textContent === shortMultiline);
      expect(bubbleText).toHaveStyle({ whiteSpace: 'pre-wrap' });
    });

    it('does not offer Show more on short messages', () => {
      render(
        <Harness
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: 'Hi everyone', ts: Date.now() },
          ]}
        />,
      );

      expect(screen.getByText('Hi everyone')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /show less/i })).not.toBeInTheDocument();
    });

    it('collapses a message over 800 characters with a Show more control', () => {
      render(
        <Harness
          messages={[
            { id: 'msg-long-chars', sender: { id: 'bob', name: 'Bob' }, text: longByChars, ts: Date.now() },
          ]}
        />,
      );

      const showMore = screen.getByRole('button', { name: /show more/i });
      expect(showMore).toBeInTheDocument();
      expect(showMore).toHaveAttribute('aria-expanded', 'false');
    });

    it('collapses a message with more than 12 lines with a Show more control', () => {
      render(
        <Harness
          messages={[
            { id: 'msg-long-lines', sender: { id: 'bob', name: 'Bob' }, text: longByLines, ts: Date.now() },
          ]}
        />,
      );

      expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
    });

    it('expands on Show more and re-collapses on Show less', () => {
      render(
        <Harness
          messages={[
            { id: 'msg-toggle', sender: { id: 'bob', name: 'Bob' }, text: longByChars, ts: Date.now() },
          ]}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /show more/i }));

      const showLess = screen.getByRole('button', { name: /show less/i });
      expect(showLess).toBeInTheDocument();
      expect(showLess).toHaveAttribute('aria-expanded', 'true');
      expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();

      fireEvent.click(showLess);

      const showMoreAgain = screen.getByRole('button', { name: /show more/i });
      expect(showMoreAgain).toBeInTheDocument();
      expect(showMoreAgain).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: /show less/i })).not.toBeInTheDocument();
    });

    it('keeps expansion state independent per message', () => {
      render(
        <Harness
          messages={[
            { id: 'a', sender: { id: 'alice', name: 'Alice' }, text: longByChars, ts: Date.now() },
            { id: 'b', sender: { id: 'bob', name: 'Bob' }, text: `${longByChars}y`, ts: Date.now() + 1 },
          ]}
        />,
      );

      const showMoreButtons = screen.getAllByRole('button', { name: /show more/i });
      expect(showMoreButtons).toHaveLength(2);

      fireEvent.click(showMoreButtons[0]);

      expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
      // Second message remains collapsed.
      expect(screen.getAllByRole('button', { name: /show more/i })).toHaveLength(1);
    });

    // Pins native <button> affordances (role, focusability, tagName). Enter/Space
    // activation then follows from the platform; jsdom does not synthesize it.
    it('is a focusable native button that toggles on activation', () => {
      render(
        <Harness
          messages={[
            { id: 'msg-kb', sender: { id: 'bob', name: 'Bob' }, text: longByChars, ts: Date.now() },
          ]}
        />,
      );

      const showMore = screen.getByRole('button', { name: /show more/i });
      expect(showMore.tagName).toBe('BUTTON');
      showMore.focus();
      expect(showMore).toHaveFocus();

      fireEvent.click(showMore);

      expect(screen.getByRole('button', { name: /show less/i })).toHaveAttribute('aria-expanded', 'true');
    });

    it('copies the full canonical text while the bubble is still collapsed', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      const fullPaste = `${'Line of a long prompt with extra padding text\n'.repeat(40)}TAIL_MARKER`;
      expect(fullPaste.length).toBeGreaterThan(800);

      render(
        <Harness
          messages={[
            { id: 'msg-copy-collapsed', sender: { id: 'bob', name: 'Bob' }, text: fullPaste, ts: Date.now() },
          ]}
        />,
      );

      // Still collapsed when we copy.
      expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Copy message from Bob' }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1);
      });
      expect(writeText).toHaveBeenCalledWith(fullPaste);
    });
  });

  // Safe web-link linkification (#197): http/https/www → MUI Link (new tab,
  // noopener noreferrer); other schemes stay plain text; no HTML injection;
  // composes with pre-wrap + collapse; copy still returns raw original text.
  describe('clickable web links', () => {
    function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
    }

    it('renders an https URL as a link that opens in a new tab with noopener noreferrer', () => {
      render(
        <Harness
          messages={[
            {
              sender: { id: 'bob', name: 'Bob' },
              text: 'Docs: https://example.com/path',
              ts: Date.now(),
            },
          ]}
        />,
      );

      const link = screen.getByRole('link', { name: 'https://example.com/path' });
      expect(link).toHaveAttribute('href', 'https://example.com/path');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders a bare www URL as an https link', () => {
      render(
        <Harness
          messages={[
            {
              sender: { id: 'bob', name: 'Bob' },
              text: 'Site: www.example.com',
              ts: Date.now(),
            },
          ]}
        />,
      );

      const link = screen.getByRole('link', { name: 'www.example.com' });
      expect(link).toHaveAttribute('href', 'https://www.example.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('leaves javascript:, data:, mailto:, and custom schemes as plain inert text', () => {
      const text = [
        'javascript:alert(1)',
        'data:text/html,hi',
        'mailto:user@example.com',
        'ftp://files.example.com',
        'custom://app/open',
      ].join(' ');

      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      // Full original text still visible as plain content (no anchors).
      expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)).toBeInTheDocument();
    });

    // Scheme-smuggling: a non-allowlisted scheme token must stay entirely inert —
    // never promote an embedded https/www tail into a nested anchor.
    it('does not linkify an https tail smuggled after javascript:', () => {
      const text = 'javascript:https://example.com';

      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)).toBeInTheDocument();
    });

    it('does not linkify a www tail smuggled after file://', () => {
      const text = 'file://www.example.com';

      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)).toBeInTheDocument();
    });

    // Comma is prose punctuation — a URL right after it must still linkify.
    it('linkifies a URL immediately after a comma boundary', () => {
      render(
        <Harness
          messages={[
            {
              sender: { id: 'bob', name: 'Bob' },
              text: 'See,https://example.com',
              ts: Date.now(),
            },
          ]}
        />,
      );

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', 'https://example.com');
      expect(links[0]).toHaveTextContent('https://example.com');
    });

    it('keeps trailing punctuation outside the link and leaves malformed URLs as text', () => {
      render(
        <Harness
          messages={[
            {
              sender: { id: 'bob', name: 'Bob' },
              text: 'See https://example.com. Also https://',
              ts: Date.now(),
            },
          ]}
        />,
      );

      const link = screen.getByRole('link', { name: 'https://example.com' });
      expect(link).toHaveAttribute('href', 'https://example.com');
      // Only the valid URL becomes a link; trailing period and bare scheme stay text.
      expect(screen.getAllByRole('link')).toHaveLength(1);
      const bubble = screen.getByText((_, el) =>
        el?.tagName === 'P' && el.textContent === 'See https://example.com. Also https://');
      expect(bubble).toBeInTheDocument();
      // Period sits after the anchor, not inside it.
      expect(link.nextSibling?.textContent?.startsWith('.')).toBe(true);
    });

    it('preserves newlines and keeps links working inside collapsed and expanded states', () => {
      const url = 'https://example.com/docs';
      // Over 12 lines so the bubble collapses; URL on line 2 must stay linkified.
      const lines = [
        'Intro line',
        `Read ${url}`,
        ...Array.from({ length: 12 }, (_, i) => `line ${i + 3}`),
      ];
      const text = lines.join('\n');
      expect(text.split('\n').length).toBeGreaterThan(12);

      render(
        <Harness
          messages={[
            { id: 'msg-link-collapse', sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() },
          ]}
        />,
      );

      const bubble = screen.getByText((_, el) =>
        el?.tagName === 'P' && el.textContent === text);
      expect(bubble).toHaveStyle({ whiteSpace: 'pre-wrap' });

      // Collapsed: link still present and correct.
      expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
      const collapsedLink = screen.getByRole('link', { name: url });
      expect(collapsedLink).toHaveAttribute('href', url);
      expect(collapsedLink).toHaveAttribute('target', '_blank');
      expect(collapsedLink).toHaveAttribute('rel', 'noopener noreferrer');

      fireEvent.click(screen.getByRole('button', { name: /show more/i }));

      // Expanded: same link behavior, Show less available.
      expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
      const expandedLink = screen.getByRole('link', { name: url });
      expect(expandedLink).toHaveAttribute('href', url);
      expect(expandedLink).toHaveAttribute('target', '_blank');
      expect(expandedLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('copies the raw original message text, never markup, when links are present', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      mockClipboard(writeText);

      const original = 'Check https://example.com and www.example.org please.';
      render(
        <Harness
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: original, ts: Date.now() },
          ]}
        />,
      );

      // Sanity: links are rendered (so we know we aren't testing a no-link path).
      expect(screen.getByRole('link', { name: 'https://example.com' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'www.example.org' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Copy message from Bob' }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1);
      });
      expect(writeText).toHaveBeenCalledWith(original);
    });

    // Balanced path-parens stay in the href; a prose-wrapping closer is peeled.
    it('keeps a balanced closing paren that belongs to the URL path', () => {
      const url = 'https://en.wikipedia.org/wiki/Foo_(bar)';
      render(
        <Harness
          messages={[
            { sender: { id: 'bob', name: 'Bob' }, text: `See ${url}`, ts: Date.now() },
          ]}
        />,
      );

      const link = screen.getByRole('link', { name: url });
      expect(link).toHaveAttribute('href', url);
    });

    it('excludes a prose-wrapping closing paren after the URL', () => {
      render(
        <Harness
          messages={[
            {
              sender: { id: 'bob', name: 'Bob' },
              text: '(see https://example.com)',
              ts: Date.now(),
            },
          ]}
        />,
      );

      const link = screen.getByRole('link', { name: 'https://example.com' });
      expect(link).toHaveAttribute('href', 'https://example.com');
      // Closing paren of the prose wrap sits outside the anchor.
      expect(link.nextSibling?.textContent?.startsWith(')')).toBe(true);
    });

    // Pathological trailing-`)` run: pins peel correctness (algorithm is O(n)).
    it('peels a long run of trailing closing parens without including them in the href', () => {
      const url = 'https://example.com/path';
      const trail = ')'.repeat(300);
      const text = `${url}${trail}`;

      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      const link = screen.getByRole('link', { name: url });
      expect(link).toHaveAttribute('href', url);
      expect(screen.getAllByRole('link')).toHaveLength(1);
      // Full original text still present; peeled parens remain as plain text after the link.
      expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)).toBeInTheDocument();
      expect(link.nextSibling?.textContent).toBe(trail);
    });

    // Scheme smuggling through punctuation the tokenizer treats as prose: the
    // invariant is token-level — a token carrying a non-web scheme is inert in
    // full, no matter what separates the scheme from the https tail.
    it.each([
      ['a data: token with a comma', 'data:text/plain,https://example.com'],
      ['a javascript: token with a semicolon', 'javascript:;https://example.com'],
      ['a paren-wrapped javascript: token', '(javascript:;https://example.com)'],
      ['a paren-wrapped data: token', '(data:text/plain,https://example.com)'],
      ['a quoted data: token', '"data:text/plain,https://example.com"'],
      // A foreign scheme *trailing* a candidate poisons the token just as one
      // leading it does — the token is the unit of trust, in both directions.
      ['a foreign scheme after a real URL', 'https://ok.example,javascript:https://evil.example'],
      ['a foreign scheme after a real URL, no second URL', 'https://ok.example,javascript:alert(1)'],
      ['a semicolon-separated foreign scheme after a real URL', 'https://ok.example;data:text/html,hi'],
      // Every character that ends a candidate without ending the token must also
      // start a new segment, or a scheme hides in a segment's interior.
      ['a quote-separated foreign scheme after a real URL', 'https://ok.example"javascript:https://evil.example'],
      ['a backtick-separated foreign scheme after a real URL', 'https://ok.example`javascript:https://evil.example'],
      ['an angle-bracket-separated foreign scheme after a real URL', 'https://ok.example<javascript:https://evil.example'],
      ['a brace-separated foreign scheme after a real URL', 'https://ok.example}data:text/html,hi'],
    ])('keeps the whole token inert around %s', (_label, text) => {
      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      // Nothing in a poisoned token may become an anchor — not the smuggled
      // tail, and not an otherwise-valid URL sharing the token with it.
      expect(screen.queryAllByRole('link')).toHaveLength(0);
      expect(screen.getByText((_m, el) => el?.tagName === 'P' && el.textContent === text)).toBeInTheDocument();
    });

    // Same token, no foreign scheme anywhere: each URL still stands on its own.
    // Pins the shape whose repeated scheme checks must not go quadratic.
    it('linkifies every URL in a quote-chained token', () => {
      const text = '"https://a.example"https://b.example"';
      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute('href', 'https://a.example');
      expect(links[1]).toHaveAttribute('href', 'https://b.example');
    });

    // Many plain tokens before the only URL: pins that a far-away candidate is
    // still found once the token walk reaches it (the scan carries the match
    // forward rather than re-scanning the tail for every token).
    it('linkifies a URL that follows many short plain tokens', () => {
      const text = `${'a '.repeat(200)}https://example.com`;
      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      const link = screen.getByRole('link', { name: 'https://example.com' });
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });

    // The carried match must not survive into a poisoned token: a URL far ahead
    // of many plain tokens is still inert when its own token carries a scheme.
    it('keeps a far-away URL inert when its token carries a foreign scheme', () => {
      const text = `${'a '.repeat(200)}data:text/plain,https://example.com`;
      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      expect(screen.queryAllByRole('link')).toHaveLength(0);
    });

    // Adjacent URLs separated only by punctuation must not merge into one anchor.
    it('renders comma-adjacent URLs as two separate links', () => {
      render(
        <Harness
          messages={[
            {
              sender: { id: 'bob', name: 'Bob' },
              text: 'https://one.example,https://two.example',
              ts: Date.now(),
            },
          ]}
        />,
      );

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute('href', 'https://one.example');
      expect(links[0]).toHaveTextContent('https://one.example');
      expect(links[1]).toHaveAttribute('href', 'https://two.example');
      expect(links[1]).toHaveTextContent('https://two.example');
    });

    // Prose and markup prefixes are punctuation, not part of the URL token —
    // they must not suppress linkification.
    it.each([
      ['a quote marker', '>https://example.com'],
      ['markdown bold', '**https://example.com'],
      ['a key=value prefix', 'URL=https://example.com'],
      ['an em dash', '—https://example.com'],
      ['a smart quote', '“https://example.com'],
    ])('linkifies a URL preceded by %s', (_label, text) => {
      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      const link = screen.getByRole('link', { name: 'https://example.com' });
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    // A URL glued to a word, or sitting inside a larger host/email token, is a
    // fragment of that token — never its own link.
    it.each([
      ['a URL glued to a word', 'foohttps://example.com'],
      ['a www host inside an email address', 'bob@www.example.com'],
      ['a www label inside a longer host', 'mail.www.example.com'],
      // Boundary checks must read whole code points: an astral letter exposes
      // only its low surrogate, and a combining mark trails its base letter.
      ['a URL glued to an astral letter', '\u{10400}https://example.com'],
      ['a URL glued to a decomposed accented letter', 'e\u0301https://example.com'],
    ])('leaves %s as plain text', (_label, text) => {
      render(
        <Harness
          messages={[{ sender: { id: 'bob', name: 'Bob' }, text, ts: Date.now() }]}
        />,
      );

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText((_m, el) => el?.tagName === 'P' && el.textContent === text)).toBeInTheDocument();
    });
  });
});

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePanelDialog } from './usePanelDialog';

function Panel({ label = 'Panel', onClose = vi.fn() }: { label?: string; onClose?: () => void }) {
  const { initialFocusRef, panelRef, onKeyDown } = usePanelDialog<HTMLHeadingElement>(onClose);
  return (
    <section ref={panelRef} onKeyDown={onKeyDown}>
      <h2 ref={initialFocusRef} tabIndex={-1}>{label}</h2>
      <button onClick={onClose}>Close {label}</button>
    </section>
  );
}

describe('usePanelDialog', () => {
  it('does not restore the opener after the user moves focus outside the panel', () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>Opener</button>
          <button>Elsewhere</button>
          {open && <Panel />}
        </>
      );
    }

    const view = render(<Harness open={false} />);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    view.rerender(<Harness open />);

    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    view.rerender(<Harness open={false} />);

    expect(elsewhere).toHaveFocus();
  });

  it('restores focus to the new panel trigger when switching panels', () => {
    function Harness() {
      const [panel, setPanel] = useState<'Chat' | 'People' | null>(null);
      return (
        <>
          <button onClick={() => setPanel('Chat')}>Show chat</button>
          <button onClick={() => setPanel('People')}>Show people</button>
          {panel && <Panel key={panel} label={panel} onClose={() => setPanel(null)} />}
        </>
      );
    }

    render(<Harness />);
    const chatTrigger = screen.getByRole('button', { name: 'Show chat' });
    chatTrigger.focus();
    fireEvent.click(chatTrigger);

    const peopleTrigger = screen.getByRole('button', { name: 'Show people' });
    peopleTrigger.focus();
    fireEvent.click(peopleTrigger);
    const closePeople = screen.getByRole('button', { name: 'Close People' });
    closePeople.focus();
    fireEvent.click(closePeople);

    expect(peopleTrigger).toHaveFocus();
  });

  it('does nothing when the opener is no longer connected', () => {
    function Harness({ showOpener, showPanel }: { showOpener: boolean; showPanel: boolean }) {
      return (
        <>
          {showOpener && <button>Opener</button>}
          {showPanel && <Panel />}
        </>
      );
    }

    const view = render(<Harness showOpener showPanel={false} />);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    view.rerender(<Harness showOpener showPanel />);
    const focusSpy = vi.spyOn(opener, 'focus');

    view.rerender(<Harness showOpener={false} showPanel />);
    view.rerender(<Harness showOpener={false} showPanel={false} />);

    expect(focusSpy).not.toHaveBeenCalled();
  });
});

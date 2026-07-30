import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import theme from '../theme/theme';
import TranscriptPanel from './TranscriptPanel';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const finalizedEntries = [{
  id: 'final-1',
  speaker: { name: 'Alice' },
  ts: new Date('2026-07-30T10:15:00Z'),
  text: 'The finalized speech turn.',
}, {
  id: 'final-2',
  speaker: { name: 'Bob' },
  ts: new Date('2026-07-30T10:16:00Z'),
  text: 'The next finalized speech turn.',
}];

function renderPanel() {
  return render(
    <ThemeProvider theme={theme}>
      <TranscriptPanel
        open
        active
        entries={finalizedEntries}
        isHost={false}
        canContribute
        onEnableContribution={vi.fn()}
        onStop={vi.fn()}
        onDownload={vi.fn()}
        onClose={vi.fn()}
      />
    </ThemeProvider>,
  );
}

describe('TranscriptPanel', () => {
  it('shows finalized speech turns only', () => {
    renderPanel();

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('The finalized speech turn.')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('The next finalized speech turn.')).toBeInTheDocument();
    expect(screen.queryByText(/^listening$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

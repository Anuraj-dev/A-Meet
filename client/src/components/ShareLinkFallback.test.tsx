import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import theme from '../theme/theme';
import ShareLinkFallback from './ShareLinkFallback';

const link = 'https://ameet.example/lobby/abc-defg-hij';

function renderFallback(value: string | null, onClose = vi.fn()) {
  render(
    <ThemeProvider theme={theme}>
      <ShareLinkFallback link={value} onClose={onClose} />
    </ThemeProvider>,
  );
  return onClose;
}

describe('ShareLinkFallback', () => {
  it('shows the full joining link when automatic copy did not work', () => {
    renderFallback(link);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Meeting link' })).toHaveValue(link);
    expect(screen.getByText(/blocked automatic copy/i)).toBeInTheDocument();
  });

  it('stays closed when there is no link to show', () => {
    renderFallback(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the user dismisses it', () => {
    const onClose = renderFallback(link);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

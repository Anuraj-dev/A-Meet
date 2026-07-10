import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import theme from '../theme/theme';
import MediaReconnectingAlert from './MediaReconnectingAlert';

describe('MediaReconnectingAlert', () => {
  it('gives the reconnection progress indicator an accessible name', () => {
    render(
      <ThemeProvider theme={theme}>
        <MediaReconnectingAlert />
      </ThemeProvider>,
    );

    expect(screen.getByRole('progressbar', { name: 'Reconnecting media' })).toBeInTheDocument();
  });
});

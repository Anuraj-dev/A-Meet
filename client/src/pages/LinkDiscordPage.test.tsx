import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import theme from '../theme/theme';
import { linkDiscord } from '../api/discord';
import LinkDiscordPage from './LinkDiscordPage';

// The page's only dependency is the link API call (the ProtectedRoute wrapper
// owns the signed-in check); stub it so the test is about what the user sees for
// each outcome, not the network.
vi.mock('../api/discord', () => ({ linkDiscord: vi.fn() }));

const mockLink = vi.mocked(linkDiscord);

function renderAt(path: string) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <LinkDiscordPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeAll(() => {
  window.matchMedia ||= vi.fn().mockImplementation((query) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LinkDiscordPage', () => {
  it('confirms once the token is exchanged successfully', async () => {
    mockLink.mockResolvedValue();
    renderAt('/link/discord?token=good-token');

    expect(await screen.findByText(/Discord linked/i)).toBeInTheDocument();
    expect(mockLink).toHaveBeenCalledWith('good-token');
  });

  it('shows an expired/invalid message when the API rejects the token', async () => {
    mockLink.mockRejectedValue(
      Object.assign(new Error('bad'), { response: { status: 400 } }),
    );
    renderAt('/link/discord?token=stale-token');

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
  });

  it('shows a missing-link message and never calls the API without a token', async () => {
    renderAt('/link/discord');

    expect(await screen.findByText(/link is missing/i)).toBeInTheDocument();
    expect(mockLink).not.toHaveBeenCalled();
  });
});

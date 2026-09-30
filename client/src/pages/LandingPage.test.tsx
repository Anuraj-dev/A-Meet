import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '@mui/material/styles';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import theme from '../theme/theme';

const { navigateMock, postMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigateMock,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Ada Lovelace', avatar: '' },
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../api/axios', () => ({
  default: { post: postMock },
}));

vi.mock('../components/EtherealShadow', () => ({ default: () => null }));
vi.mock('../components/UpcomingMeetings', () => ({ default: () => null }));
vi.mock('../components/ScheduleMeetingDialog', () => ({ default: () => null }));

import LandingPage from './LandingPage';

function renderLanding() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <LandingPage />
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

beforeEach(() => {
  navigateMock.mockClear();
  postMock.mockReset();
});

describe('LandingPage join and create', () => {
  it('joins from a pasted invite link instead of keeping the query string', () => {
    renderLanding();
    fireEvent.change(screen.getByRole('textbox', { name: 'Meeting code or link' }), {
      target: { value: 'https://ameet.raja-dev.me/lobby/abc-defg-hij?guest=1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(navigateMock).toHaveBeenCalledWith('/lobby/abc-defg-hij');
  });

  it('joins when the code is typed as three words', () => {
    renderLanding();
    fireEvent.change(screen.getByRole('textbox', { name: 'Meeting code or link' }), {
      target: { value: 'abc defg hij' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(navigateMock).toHaveBeenCalledWith('/lobby/abc-defg-hij');
  });

  it('explains a bad code and stays on the page', () => {
    renderLanding();
    fireEvent.change(screen.getByRole('textbox', { name: 'Meeting code or link' }), {
      target: { value: 'not a meeting' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/meeting code/i);
  });

  it('tells the user when a new meeting cannot be created', async () => {
    postMock.mockRejectedValue(new Error('offline'));
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'New meeting' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not start/i);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('keeps a failed create beside New meeting when the join field changes', async () => {
    postMock.mockRejectedValue(new Error('offline'));
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'New meeting' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not start/i);

    const code = screen.getByRole('textbox', { name: 'Meeting code or link' });
    const newMeeting = screen.getByRole('button', { name: 'New meeting' });
    fireEvent.change(code, { target: { value: 'not a meeting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(screen.getByText(/could not start/i)).toBeInTheDocument();
    expect(screen.getByText(/meeting code/i)).toBeInTheDocument();
    expect(code).toHaveAttribute('aria-describedby', 'join-code-error');
    expect(newMeeting).toHaveAttribute('aria-describedby', 'create-meeting-error');
    expect(code).not.toHaveAccessibleDescription(/could not start/i);

    fireEvent.change(code, { target: { value: 'not a meetin' } });

    expect(screen.queryByText(/meeting code/i)).not.toBeInTheDocument();
    expect(screen.getByText(/could not start/i)).toBeInTheDocument();
    expect(code).not.toHaveAttribute('aria-describedby');
    expect(newMeeting).toHaveAttribute('aria-describedby', 'create-meeting-error');
    expect(code).not.toHaveAccessibleDescription(/could not start/i);
  });

  it('opens the room after a meeting is created', async () => {
    postMock.mockResolvedValue({ data: { roomId: 'abc-defg-hij' } });
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'New meeting' }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(
      '/room/abc-defg-hij',
      { state: { fromCreate: true } },
    ));
  });
});

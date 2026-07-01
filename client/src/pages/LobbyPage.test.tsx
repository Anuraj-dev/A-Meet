import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import theme from '../theme/theme';

// Capture router navigation without a real history. useParams stays real so the
// page still reads :roomId from the route.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigateMock,
}));

// A signed-in user, so the page renders its authenticated chrome.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Ada Lovelace', avatar: '' } }),
}));

// Presentational-only children that pull in canvas/video/animation internals —
// stubbed so the test stays about lobby behavior, not rendering effects.
vi.mock('../components/EtherealShadow', () => ({ default: () => null }));
vi.mock('../components/VideoTile', () => ({ default: () => null }));
vi.mock('../services/sounds', () => ({ playSound: vi.fn() }));

import LobbyPage from './LobbyPage';

const ROOM_ID = 'abc-defg-hij';

// Minimal MediaStream stand-in (jsdom has none): tracks-in, kind-filtered out.
class FakeMediaStream {
  _tracks: MediaStreamTrack[];
  constructor(tracks: MediaStreamTrack[] = []) { this._tracks = [...tracks]; }
  addTrack(t: MediaStreamTrack) { this._tracks.push(t); }
  removeTrack(t: MediaStreamTrack) { this._tracks = this._tracks.filter((x) => x !== t); }
  getTracks() { return this._tracks; }
  getVideoTracks() { return this._tracks.filter((t) => t.kind === 'video'); }
  getAudioTracks() { return this._tracks.filter((t) => t.kind === 'audio'); }
}

function track(kind: 'audio' | 'video', deviceId: string): MediaStreamTrack {
  return { kind, enabled: true, stop: vi.fn(), getSettings: () => ({ deviceId }) } as unknown as MediaStreamTrack;
}

const getUserMedia = vi.fn();
const enumerateDevices = vi.fn();

function exactDeviceId(constraint: boolean | MediaTrackConstraints | undefined, fallback: string) {
  if (!constraint || constraint === true) return fallback;
  const deviceId = constraint.deviceId;
  return typeof deviceId === 'object' && deviceId && 'exact' in deviceId
    ? String(deviceId.exact)
    : fallback;
}

// Two cameras + two mics, the default device set used by the happy-path tests.
function mockDeviceSet() {
  enumerateDevices.mockResolvedValue([
    { kind: 'videoinput', deviceId: 'cam-1', label: 'Cam One' },
    { kind: 'videoinput', deviceId: 'cam-2', label: 'Cam Two' },
    { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic One' },
    { kind: 'audioinput', deviceId: 'mic-2', label: 'Mic Two' },
  ]);
  getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
    if (constraints.audio) return new FakeMediaStream([track('audio', exactDeviceId(constraints.audio, 'mic-1'))]);
    if (constraints.video) return new FakeMediaStream([track('video', exactDeviceId(constraints.video, 'cam-1'))]);
    return new FakeMediaStream([]);
  });
}

function renderLobby() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[`/lobby/${ROOM_ID}`]}>
        <Routes>
          <Route path="/lobby/:roomId" element={<LobbyPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeAll(() => {
  // MUI + framer-motion poke at these in jsdom; provide inert stubs.
  window.matchMedia ||= vi.fn().mockImplementation((query) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
  globalThis.MediaStream = FakeMediaStream as unknown as typeof MediaStream;
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia, enumerateDevices },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  navigateMock.mockReset();
});

describe('LobbyPage', () => {
  it('populates the camera + microphone pickers from enumerateDevices', async () => {
    mockDeviceSet();
    renderLobby();

    // The selected device labels render once getUserMedia + enumerate resolve.
    expect(await screen.findByText('Cam One')).toBeInTheDocument();
    expect(screen.getByText('Mic One')).toBeInTheDocument();

    // Both cameras are offered in the dropdown (open it via its current value).
    fireEvent.mouseDown(screen.getByText('Cam One'));
    const cameraList = await screen.findByRole('listbox');
    expect(within(cameraList).getByRole('option', { name: /Cam One/i })).toBeInTheDocument();
    expect(within(cameraList).getByRole('option', { name: /Cam Two/i })).toBeInTheDocument();
  });

  it('reflects a changed camera selection and carries it into the join', async () => {
    mockDeviceSet();
    renderLobby();
    await screen.findByText('Cam One');

    fireEvent.mouseDown(screen.getByText('Cam One'));
    fireEvent.click(await screen.findByRole('option', { name: /Cam Two/i }));

    // Selection is reflected in the closed picker...
    expect(await screen.findByText('Cam Two')).toBeInTheDocument();

    // ...and flows into the join navigation state.
    fireEvent.click(screen.getByRole('button', { name: /Join now/i }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).toHaveBeenCalledWith(
      `/room/${ROOM_ID}`,
      expect.objectContaining({ state: expect.objectContaining({ videoDeviceId: 'cam-2' }) }),
    );
  });

  it('navigates to the room and passes the full device choices on join', async () => {
    mockDeviceSet();
    renderLobby();
    await screen.findByText('Cam One');

    fireEvent.click(screen.getByRole('button', { name: /Join now/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).toHaveBeenCalledWith(`/room/${ROOM_ID}`, {
      state: {
        fromLobby: true,
        videoDeviceId: 'cam-1',
        audioDeviceId: 'mic-1',
        startVideoOn: true,
        startAudioOn: true,
      },
    });
  });

  it('handles a getUserMedia denial gracefully (recoverable, still joinable)', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    getUserMedia.mockRejectedValue(denied);
    enumerateDevices.mockResolvedValue([]); // no labels granted without permission

    renderLobby();

    // The page doesn't crash and shows its camera-off state.
    expect(await screen.findByText('Camera is off')).toBeInTheDocument();

    // Join still works, carrying the empty/off device state through.
    fireEvent.click(screen.getByRole('button', { name: /Join now/i }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).toHaveBeenCalledWith(`/room/${ROOM_ID}`, {
      state: {
        fromLobby: true,
        videoDeviceId: '',
        audioDeviceId: '',
        startVideoOn: false,
        startAudioOn: false,
      },
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RoomGuard from './RoomGuard.jsx';
import api from '../api/axios';

// RoomGuard talks to the API to validate the code; stub it so these tests stay
// about routing, not the network.
vi.mock('../api/axios', () => ({
  default: { get: vi.fn() },
}));

const CODE = 'abc-defg-hij';

// Renders RoomGuard for /room/:roomId with the given navigation state, alongside
// a sibling /lobby route, so we can assert which screen actually shows.
function renderRoomEntry(state) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/room/${CODE}`, state }]}>
      <Routes>
        <Route
          path="/room/:roomId"
          element={
            <RoomGuard>
              <div>ROOM CONTENT</div>
            </RoomGuard>
          }
        />
        <Route path="/lobby/:roomId" element={<div>LOBBY CONTENT</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('<RoomGuard /> lobby gate', () => {
  beforeEach(() => {
    // Valid, active room for every test; the routing decision is what varies.
    api.get.mockResolvedValue({ data: { roomId: CODE, active: true } });
  });

  it('bounces a cold /room link open (no nav state) to the lobby/preview', async () => {
    renderRoomEntry(undefined);
    expect(await screen.findByText('LOBBY CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('ROOM CONTENT')).not.toBeInTheDocument();
  });

  it('bounces an arrival with state but no entry marker to the lobby', async () => {
    renderRoomEntry({ foo: 'bar' });
    expect(await screen.findByText('LOBBY CONTENT')).toBeInTheDocument();
  });

  it('lets the creator instant-join (fromCreate) straight into the room', async () => {
    renderRoomEntry({ fromCreate: true });
    expect(await screen.findByText('ROOM CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('LOBBY CONTENT')).not.toBeInTheDocument();
  });

  it('lets a deliberate lobby Join (fromLobby) into the room', async () => {
    renderRoomEntry({ fromLobby: true, startVideoOn: true });
    expect(await screen.findByText('ROOM CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('LOBBY CONTENT')).not.toBeInTheDocument();
  });
});

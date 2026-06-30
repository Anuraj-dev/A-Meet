import { createContext, useEffect, useState, type ReactNode } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import api from '../api/axios';
import CheckMeetingCode from '../pages/CheckMeetingCode';
import { shouldRedirectToLobby } from '../utils/room-entry';
import type { RoomMetadataDto } from '@a-meet/contracts';
import type { AxiosError } from 'axios';

type GuardStatus = 'valid' | 'invalid' | 'ended';
interface GuardResult { code: string; status: GuardStatus }

// Room metadata (title, scheduledFor, …) fetched by RoomGuard and made available
// to child pages so lobby and room can show scheduled-meeting info without a
// second API call. Context is co-located with the guard that provides it;
// only-export-components is a fast-refresh DX guard, not correctness, so a
// narrow opt-out is fine here.
// eslint-disable-next-line react-refresh/only-export-components
export const RoomMetaContext = createContext<RoomMetadataDto | null>(null);

// Validates the :roomId in the URL against the server before rendering the
// Lobby/Room. A non-existent code renders the "Check your meeting code" screen;
// an ended meeting renders a clearer "meeting has ended" variant.
export default function RoomGuard({ children }: { children: ReactNode }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Result is tagged with the code it belongs to, so a stale result for a
  // previous code never shows for the current one (status derives to 'loading').
  const [result, setResult] = useState<GuardResult | null>(null); // { code, status: 'valid'|'invalid'|'ended' }
  const [roomMeta, setRoomMeta] = useState<RoomMetadataDto | null>(null);

  // Canonical code is lowercase, no stray whitespace. If the URL isn't canonical
  // (uppercase from autocapitalize, a pasted space), redirect BEFORE anything
  // else — otherwise two people could land in different SFU rooms for the same
  // code (the room is keyed by the exact string), or the lookup 404s.
  const canonical = (roomId ?? '').trim().toLowerCase();
  const needsCanonical = canonical !== roomId;

  useEffect(() => {
    if (!needsCanonical) return;
    const base = location.pathname.startsWith('/room/') ? '/room/' : '/lobby/';
    navigate(base + encodeURIComponent(canonical), { replace: true, state: location.state });
  }, [needsCanonical, canonical, location.pathname, location.state, navigate]);

  useEffect(() => {
    if (needsCanonical) return undefined; // wait for the redirect to land
    let active = true;
    api
      .get<RoomMetadataDto>(`/rooms/${encodeURIComponent(canonical)}`)
      .then((res) => {
        if (!active) return;
        setResult({ code: canonical, status: 'valid' });
        setRoomMeta(res.data ?? null);
      })
      .catch((err: AxiosError) => {
        if (!active) return;
        // 410 Gone = the meeting existed but the host ended it.
        setResult({ code: canonical, status: err?.response?.status === 410 ? 'ended' : 'invalid' });
      });
    return () => {
      active = false;
    };
  }, [canonical, needsCanonical]);

  const status = !needsCanonical && result?.code === canonical ? result.status : 'loading';

  // Lobby/preview gate (Google-Meet behaviour). Instant-join is a one-shot tied
  // to ENTERING a meeting, not to identity: only the creator's instant meeting
  // (`fromCreate`) and a deliberate Join from the preview (`fromLobby`) may land
  // straight on /room. Any other arrival at /room/:id — a cold link open, a
  // refresh, the same account opening the link in another browser — is bounced
  // to /lobby so it sees the preview first. Replace so Back doesn't re-trigger.
  const needsLobbyRedirect =
    status === 'valid' && shouldRedirectToLobby(location.pathname, location.state);

  useEffect(() => {
    if (!needsLobbyRedirect) return;
    navigate(`/lobby/${encodeURIComponent(canonical)}`, { replace: true });
  }, [needsLobbyRedirect, canonical, navigate]);

  if (status === 'loading' || needsLobbyRedirect) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (status === 'invalid') return <CheckMeetingCode />;
  if (status === 'ended') return <CheckMeetingCode ended />;

  return (
    <RoomMetaContext.Provider value={roomMeta}>
      {children}
    </RoomMetaContext.Provider>
  );
}

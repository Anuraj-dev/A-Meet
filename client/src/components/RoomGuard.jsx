import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import api from '../api/axios';
import CheckMeetingCode from '../pages/CheckMeetingCode';

// Validates the :roomId in the URL against the server before rendering the
// Lobby/Room. A non-existent code renders the "Check your meeting code" screen;
// an ended meeting renders a clearer "meeting has ended" variant.
export default function RoomGuard({ children }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Result is tagged with the code it belongs to, so a stale result for a
  // previous code never shows for the current one (status derives to 'loading').
  const [result, setResult] = useState(null); // { code, status: 'valid'|'invalid'|'ended' }

  // Canonical code is lowercase, no stray whitespace. If the URL isn't canonical
  // (uppercase from autocapitalize, a pasted space), redirect BEFORE anything
  // else — otherwise two people could land in different SFU rooms for the same
  // code (the room is keyed by the exact string), or the lookup 404s.
  const canonical = roomId.trim().toLowerCase();
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
      .get(`/rooms/${encodeURIComponent(canonical)}`)
      .then(() => active && setResult({ code: canonical, status: 'valid' }))
      .catch((err) => {
        if (!active) return;
        // 410 Gone = the meeting existed but the host ended it.
        setResult({ code: canonical, status: err?.response?.status === 410 ? 'ended' : 'invalid' });
      });
    return () => {
      active = false;
    };
  }, [canonical, needsCanonical]);

  const status = !needsCanonical && result?.code === canonical ? result.status : 'loading';

  if (status === 'loading') {
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

  return children;
}

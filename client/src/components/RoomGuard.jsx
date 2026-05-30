import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import api from '../api/axios';
import CheckMeetingCode from '../pages/CheckMeetingCode';

// Validates the :roomId in the URL against the server before rendering the
// Lobby/Room. A non-existent or inactive code renders the "Check your meeting
// code" screen instead of letting the SFU lazily spin up a room for garbage.
export default function RoomGuard({ children }) {
  const { roomId } = useParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'valid' | 'invalid'

  useEffect(() => {
    let active = true;
    setStatus('loading');
    api
      .get(`/rooms/${encodeURIComponent(roomId)}`)
      .then(() => active && setStatus('valid'))
      .catch(() => active && setStatus('invalid'));
    return () => {
      active = false;
    };
  }, [roomId]);

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

  return children;
}

import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';

export default function RoomPage() {
  const { roomId } = useParams();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          Room — {roomId}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Video will arrive in M2. Socket.io chat in M1.
        </Typography>
      </Box>
    </Box>
  );
}

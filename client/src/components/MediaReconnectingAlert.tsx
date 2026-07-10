import { Alert, CircularProgress } from '@mui/material';

export default function MediaReconnectingAlert() {
  return (
    <Alert
      severity="warning"
      variant="filled"
      icon={(
        <CircularProgress
          aria-label="Reconnecting media"
          size={18}
          thickness={5}
          sx={{ color: 'inherit' }}
        />
      )}
      sx={{
        borderRadius: 2,
        mb: 1,
        bgcolor: 'error.dark',
        color: '#fff',
        '& .MuiAlert-icon': { color: '#fff' },
      }}
    >
      Reconnecting media…
    </Alert>
  );
}

import type { FocusEvent } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';

interface ShareLinkFallbackProps {
  link: string | null;
  onClose: () => void;
}

export default function ShareLinkFallback({ link, onClose }: ShareLinkFallbackProps) {
  return (
    <Dialog
      open={Boolean(link)}
      onClose={onClose}
      slotProps={{ paper: { sx: { borderRadius: 3, minWidth: 320, maxWidth: 480 } } }}
    >
      <DialogTitle sx={{ pb: 1 }}>Copy this meeting link</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          The browser blocked automatic copy. Select the joining link below.
        </Typography>
        <TextField
          fullWidth
          autoFocus
          value={link ?? ''}
          slotProps={{
            htmlInput: {
              readOnly: true,
              'aria-label': 'Meeting link',
              onFocus: (event: FocusEvent<HTMLInputElement>) => event.currentTarget.select(),
            },
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

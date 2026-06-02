import { Component } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { Error as ErrorOutlineIcon } from '@mui/icons-material';
import { appLogger } from '../utils/logger';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    appLogger.error('React render error', {
      error: error.message,
      stack: error.stack?.slice(0, 800),
      componentStack: info.componentStack?.slice(0, 400),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default',
          }}
        >
          <Paper sx={{ p: 4, maxWidth: 400, textAlign: 'center' }}>
            <ErrorOutlineIcon sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Something went wrong
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              An unexpected error occurred. Please reload to try again.
            </Typography>
            <Button variant="contained" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </Paper>
        </Box>
      );
    }
    return this.props.children;
  }
}

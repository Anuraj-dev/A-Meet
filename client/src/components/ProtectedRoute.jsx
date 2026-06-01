import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    // Remember the deep link (e.g. a /lobby/:roomId meeting invite) before
    // bouncing to the home page, so sign-in returns the user here instead of
    // stranding them on the landing page. login() carries this through OAuth.
    const returnTo = location.pathname + location.search;
    if (returnTo && returnTo !== '/') sessionStorage.setItem('ameet:returnTo', returnTo);
    return <Navigate to="/" replace />;
  }
  return children;
}

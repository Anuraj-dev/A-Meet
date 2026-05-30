import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/lobby/:roomId"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <LobbyPage />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/room/:roomId"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <RoomPage />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

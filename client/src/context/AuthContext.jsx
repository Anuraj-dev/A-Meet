import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const { data } = await api.get('/auth/me');
      // /auth/me responds `{ user: {...} }`; store the flat user so consumers
      // can read user.name / user.avatar / user.id directly.
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function login(returnTo) {
    const base = import.meta.env.VITE_SERVER_URL ?? '';
    // Send the post-login destination along so the server can land us back on
    // the meeting invite link. Falls back to a deep link a ProtectedRoute
    // stashed before bouncing here; cleared once consumed so a later plain
    // sign-in doesn't reuse a stale target.
    const target = returnTo ?? sessionStorage.getItem('ameet:returnTo') ?? '';
    sessionStorage.removeItem('ameet:returnTo');
    const qs = target ? `?returnTo=${encodeURIComponent(target)}` : '';
    window.location.href = `${base}/api/auth/google${qs}`;
  }

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

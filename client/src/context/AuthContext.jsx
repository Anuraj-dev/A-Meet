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

  // Mount-time session probe. refresh() awaits /auth/me before any setState, so
  // the user/loading updates land asynchronously (not synchronously in the effect
  // body) — the cascading-render concern the rule guards against doesn't apply.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, []);

  function login(returnTo) {
    const base = import.meta.env.VITE_SERVER_URL ?? '';
    // Send the post-login destination along so the server can land us back on
    // the meeting invite link. Falls back to a deep link a ProtectedRoute
    // stashed before bouncing here; cleared once consumed so a later plain
    // sign-in doesn't reuse a stale target. Guard against `login` being wired
    // straight to onClick — React would pass a SyntheticEvent as `returnTo`,
    // which would shadow the stashed deep link and strand the user on `/`.
    const explicit = typeof returnTo === 'string' ? returnTo : '';
    const target = explicit || sessionStorage.getItem('ameet:returnTo') || '';
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

// Provider and its consumer hook are intentionally co-located in this context
// module; the only-export-components rule is a fast-refresh DX guard, not a
// correctness rule, and splitting the hook into a separate file buys nothing here.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

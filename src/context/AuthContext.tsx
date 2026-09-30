import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';
import { staticMe } from '../lib/staticStore';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  isStatic: boolean;
}
const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('minegov:session-expired', onExpired);

    // Check static mode first - if we have static user in localStorage
    try {
      const staticUser = staticMe();
      if (staticUser) {
        setUser(staticUser);
        setLoading(false);
        return () => window.removeEventListener('minegov:session-expired', onExpired);
      }
    } catch {}

    const token = localStorage.getItem('minegov_token');
    if (!token) {
      setLoading(false);
      return () => window.removeEventListener('minegov:session-expired', onExpired);
    }
    api
      .get<{ user: User }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => {
        // If api fails, try static user as fallback
        try {
          const staticUser = staticMe();
          if (staticUser) {
            setUser(staticUser);
            return;
          }
        } catch {}
        localStorage.removeItem('minegov_token');
        setUser(null);
      })
      .finally(() => setLoading(false));
    return () => window.removeEventListener('minegov:session-expired', onExpired);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      setUser,
      isStatic: api.isStaticMode(),
      async login(email, password) {
        const result = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
        // api.post in static mode already stores token and user via staticStore
        // but ensure token is stored for compatibility
        if (result.token) localStorage.setItem('minegov_token', result.token);
        setUser(result.user);
        return result.user;
      },
      async logout() {
        try {
          if (localStorage.getItem('minegov_token')) await api.post('/auth/logout');
        } catch {
          // ignore errors in static mode
        } finally {
          localStorage.removeItem('minegov_token');
          // staticStore logout also clears static user
          try {
            localStorage.removeItem('minegov_static_user');
          } catch {}
          setUser(null);
        }
      },
    }),
    [user, loading]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

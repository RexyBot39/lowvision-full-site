import { createContext, useContext, useEffect, useState } from 'react';
import { api, type ApiUser } from '../lib/api';
import { syncOnSignIn, stopSync } from '../lib/planSync';

interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  authConfigured: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const noop = async () => ({ error: 'Accounts are not available.' });

// Default value used during prerendering (no provider) — signed out.
const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  authConfigured: true,
  signInWithEmail: noop,
  signUpWithEmail: noop,
  signOut: async () => {},
});

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authConfigured, setAuthConfigured] = useState(true);

  useEffect(() => {
    api<{ configured: boolean; user: ApiUser | null }>('/auth/me')
      .then(({ configured, user: me }) => {
        setAuthConfigured(configured);
        setUser(me);
        if (me) void syncOnSignIn();
      })
      .catch(() => setAuthConfigured(false))
      .finally(() => setLoading(false));
  }, []);

  async function signInWithEmail(email: string, password: string) {
    try {
      const { user: me } = await api<{ user: ApiUser }>('/auth/login', { method: 'POST', body: { email, password } });
      await syncOnSignIn();
      setUser(me);
      return { error: null };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  }

  async function signUpWithEmail(email: string, password: string, displayName: string) {
    try {
      const { user: me } = await api<{ user: ApiUser }>('/auth/signup', {
        method: 'POST',
        body: { email, password, name: displayName },
      });
      await syncOnSignIn();
      setUser(me);
      return { error: null };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  }

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      /* clear local state regardless */
    }
    stopSync();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, authConfigured, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

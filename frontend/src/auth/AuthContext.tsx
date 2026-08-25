import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type StaffUser } from '../api/client';

const TOKEN_STORAGE_KEY = 'lankaauto_staff_token';

interface AuthState {
  user: StaffUser | null;
  token: string | null;
  /** True only while validating a token found in storage on first load. */
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Holds the staff session: token in localStorage (survives a refresh — a
 * mechanic mid-shift shouldn't be logged out by a reload), user object in
 * memory. On mount, a stored token is re-validated against `GET /auth/me`
 * rather than trusted blindly, since it could have expired or the account
 * could have been deactivated since it was issued.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(token !== null);

  useEffect(() => {
    if (token === null) {
      setLoading(false);
      return;
    }
    api
      .me(token)
      .then(setUser)
      .catch(() => {
        setToken(null);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      })
      .finally(() => setLoading(false));
    // Only re-validate when the token itself changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function login(username: string, password: string) {
    const { token: newToken, user: newUser } = await api.login(username, password);
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../api/endpoints';
import { tokenStore, ApiError } from '../api/client';
import type { Profile, User } from '../api/types';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (login: string, password: string) => Promise<void>;
  register: (data: { username: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: !!tokenStore.access,
    error: null,
  });

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await authApi.me();
      setState((s) => ({ ...s, user: profile.user, profile, loading: false, error: null }));
    } catch (e) {
      tokenStore.clear();
      setState({ user: null, profile: null, loading: false, error: null });
    }
  }, []);

  useEffect(() => {
    if (tokenStore.access) {
      void refreshProfile();
    }
  }, [refreshProfile]);

  const login = useCallback(async (login: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const tokens = await authApi.login(login, password);
      tokenStore.set(tokens.access, tokens.refresh);
      setState((s) => ({ ...s, user: tokens.user }));
      await refreshProfile();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Не удалось войти';
      setState((s) => ({ ...s, loading: false, error: message }));
      throw e;
    }
  }, [refreshProfile]);

  const register = useCallback(async (data: { username: string; email: string; password: string }) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const tokens = await authApi.register(data);
      tokenStore.set(tokens.access, tokens.refresh);
      setState((s) => ({ ...s, user: tokens.user }));
      await refreshProfile();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Не удалось зарегистрироваться';
      setState((s) => ({ ...s, loading: false, error: message }));
      throw e;
    }
  }, [refreshProfile]);

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh ?? undefined;
    try {
      await authApi.logout(refresh);
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setState({ user: null, profile: null, loading: false, error: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, refreshProfile }),
    [state, login, register, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен быть внутри AuthProvider');
  return ctx;
}

'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import useSWR from 'swr';
import { api, fetcher } from '@/lib/api';
import type { Me } from '@/lib/types';

interface AuthState {
  user: Me | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => undefined,
  logout: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useSWR<{ user: Me | null }>('/me', fetcher);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    await mutate({ user: null });
  }, [mutate]);
  return (
    <AuthContext.Provider value={{ user: data?.user ?? null, loading: isLoading, refresh: () => mutate(), logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

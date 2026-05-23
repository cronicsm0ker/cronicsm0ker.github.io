import { create } from 'zustand';
import type { AuthTokens, MeResponse } from '@roofops/types';

const REFRESH_TOKEN_KEY = 'roofops.refreshToken';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: MeResponse['user'] | null;
  memberships: MeResponse['memberships'];
  status: 'idle' | 'authenticated' | 'unauthenticated';
  setTokens: (tokens: AuthTokens | null) => void;
  setSession: (session: { user: MeResponse['user']; memberships: MeResponse['memberships'] }) => void;
  clear: () => void;
}

function readPersistedRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

function persistRefreshToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token === null) {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  } else {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: readPersistedRefreshToken(),
  user: null,
  memberships: [],
  status: readPersistedRefreshToken() ? 'idle' : 'unauthenticated',
  setTokens(tokens) {
    if (tokens === null) {
      persistRefreshToken(null);
      set({ accessToken: null, refreshToken: null });
      return;
    }
    persistRefreshToken(tokens.refreshToken);
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  },
  setSession(session) {
    set({ user: session.user, memberships: session.memberships, status: 'authenticated' });
  },
  clear() {
    persistRefreshToken(null);
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      memberships: [],
      status: 'unauthenticated',
    });
  },
}));

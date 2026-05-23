import { create } from 'zustand';
import type { MeResponse } from '@roofops/types';

interface AuthState {
  user: MeResponse['user'] | null;
  memberships: MeResponse['memberships'];
  status: 'idle' | 'authenticated' | 'unauthenticated';
  setSession: (session: { user: MeResponse['user']; memberships: MeResponse['memberships'] }) => void;
  setStatus: (status: AuthState['status']) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  memberships: [],
  status: 'idle',
  setSession(session) {
    set({ user: session.user, memberships: session.memberships, status: 'authenticated' });
  },
  setStatus(status) {
    set({ status });
  },
  clear() {
    set({ user: null, memberships: [], status: 'unauthenticated' });
  },
}));

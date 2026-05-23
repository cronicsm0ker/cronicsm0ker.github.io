import { createApiClient, type TokenStorage } from '@roofops/api-client';
import { useAuthStore } from './auth-store.js';

const baseUrl = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

const storage: TokenStorage = {
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  setTokens: (tokens) => {
    useAuthStore.getState().setTokens(tokens);
  },
};

export const apiClient = createApiClient({
  baseUrl,
  storage,
  onUnauthorized: () => {
    useAuthStore.getState().clear();
  },
});

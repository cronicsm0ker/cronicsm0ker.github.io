import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { createApiClient, type TokenStorage } from '@roofops/api-client';

const ACCESS_TOKEN_KEY = 'roofops.accessToken';
const REFRESH_TOKEN_KEY = 'roofops.refreshToken';

const baseUrl =
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:3000';

const storage: TokenStorage = {
  async getAccessToken() {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  async getRefreshToken() {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setTokens(tokens) {
    if (tokens === null) {
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      ]);
      return;
    }
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
    ]);
  },
};

export const apiClient = createApiClient({ baseUrl, storage });
export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY };

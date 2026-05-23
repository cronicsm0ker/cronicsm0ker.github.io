import {
  ApiErrorSchema,
  type AuthTokens,
  type ForgotPasswordRequest,
  type LoginRequest,
  LoginResponseSchema,
  type LoginResponse,
  type MeResponse,
  MeResponseSchema,
  type RegisterRequest,
  type ResetPasswordRequest,
  type RefreshResponse,
  RefreshResponseSchema,
} from '@roofops/types';
import { ApiClientError } from './errors.js';

export interface TokenStorage {
  getAccessToken: () => string | null | Promise<string | null>;
  getRefreshToken: () => string | null | Promise<string | null>;
  setTokens: (tokens: AuthTokens | null) => void | Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  storage: TokenStorage;
  fetch?: typeof fetch;
  onUnauthorized?: () => void | Promise<void>;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

const REFRESH_PATH = '/auth/refresh';

export interface ApiClient {
  register: (req: RegisterRequest) => Promise<LoginResponse>;
  login: (req: LoginRequest) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  forgotPassword: (req: ForgotPasswordRequest) => Promise<void>;
  resetPassword: (req: ResetPasswordRequest) => Promise<void>;
  me: () => Promise<MeResponse>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  let refreshInFlight: Promise<AuthTokens | null> | null = null;

  async function refreshTokens(): Promise<AuthTokens | null> {
    if (refreshInFlight) {
      return refreshInFlight;
    }
    refreshInFlight = (async () => {
      const refreshToken = await options.storage.getRefreshToken();
      if (!refreshToken) {
        return null;
      }
      const res = await fetchImpl(`${options.baseUrl}${REFRESH_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await options.storage.setTokens(null);
        return null;
      }
      const json: unknown = await res.json();
      const parsed = RefreshResponseSchema.parse(json);
      await options.storage.setTokens(parsed.tokens);
      return parsed.tokens;
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function request<T>(
    path: string,
    schema: { parse: (input: unknown) => T } | null,
    opts: RequestOptions = {},
  ): Promise<T> {
    const auth = opts.auth ?? true;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (auth) {
      const token = await options.storage.getAccessToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const init: RequestInit = {
      method: opts.method ?? 'GET',
      headers,
      signal: opts.signal,
    };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
    }

    let res = await fetchImpl(`${options.baseUrl}${path}`, init);

    if (res.status === 401 && auth && path !== REFRESH_PATH) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        headers.Authorization = `Bearer ${refreshed.accessToken}`;
        res = await fetchImpl(`${options.baseUrl}${path}`, { ...init, headers });
      } else {
        await options.onUnauthorized?.();
      }
    }

    if (!res.ok) {
      let errorBody: unknown;
      try {
        errorBody = await res.json();
      } catch {
        throw new ApiClientError({
          code: 'INTERNAL_ERROR',
          message: `Request failed with status ${res.status}`,
          status: res.status,
        });
      }
      const parsedError = ApiErrorSchema.safeParse(errorBody);
      if (parsedError.success) {
        throw ApiClientError.fromApiError(parsedError.data, res.status);
      }
      throw new ApiClientError({
        code: 'INTERNAL_ERROR',
        message: `Request failed with status ${res.status}`,
        status: res.status,
        details: errorBody,
      });
    }

    if (res.status === 204 || schema === null) {
      return undefined as T;
    }

    const json: unknown = await res.json();
    return schema.parse(json);
  }

  return {
    async register(req) {
      const response = await request('/auth/register', LoginResponseSchema, {
        method: 'POST',
        body: req,
        auth: false,
      });
      await options.storage.setTokens(response.tokens);
      return response;
    },
    async login(req) {
      const response = await request('/auth/login', LoginResponseSchema, {
        method: 'POST',
        body: req,
        auth: false,
      });
      await options.storage.setTokens(response.tokens);
      return response;
    },
    async logout() {
      const refreshToken = await options.storage.getRefreshToken();
      try {
        await request('/auth/logout', null, {
          method: 'POST',
          body: { refreshToken },
        });
      } finally {
        await options.storage.setTokens(null);
      }
    },
    async forgotPassword(req) {
      await request('/auth/forgot', null, {
        method: 'POST',
        body: req,
        auth: false,
      });
    },
    async resetPassword(req) {
      await request('/auth/reset', null, {
        method: 'POST',
        body: req,
        auth: false,
      });
    },
    async me() {
      return request('/me', MeResponseSchema, { method: 'GET' });
    },
  };
}

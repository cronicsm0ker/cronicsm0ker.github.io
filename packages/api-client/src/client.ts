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
  RefreshResponseSchema,
  ContactSchema,
  type Contact,
  type ContactInput,
  type ContactPatch,
  type ContactMergeRequest,
  LeadSchema,
  LeadWithContactSchema,
  LeadListResponseSchema,
  type Lead,
  type LeadWithContact,
  type LeadListResponse,
  type LeadListQuery,
  type CreateLeadRequest,
  type UpdateLeadRequest,
  type AssignLeadRequest,
  type ChangeLeadStageRequest,
  type ActivityListResponse,
  ActivityListResponseSchema,
  MessageSchema,
  type Message,
  type MessageThread,
  MessageThreadSchema,
  type SendMessageRequest,
  PriceBookItemSchema,
  PriceBookListResponseSchema,
  type PriceBookItem,
  type PriceBookItemInput,
  type PriceBookItemPatch,
  type PriceBookKind,
} from '@roofops/types';
import { z } from 'zod';
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

  // Phase 1: contacts
  listContacts: (opts?: { search?: string; limit?: number }) => Promise<{ items: Contact[] }>;
  getContact: (id: string) => Promise<Contact>;
  upsertContact: (input: ContactInput) => Promise<Contact>;
  updateContact: (id: string, patch: ContactPatch) => Promise<Contact>;
  mergeContacts: (req: ContactMergeRequest) => Promise<Contact>;

  // Phase 1: leads
  listLeads: (query?: Partial<LeadListQuery>) => Promise<LeadListResponse>;
  createLead: (req: CreateLeadRequest) => Promise<LeadWithContact>;
  getLead: (id: string) => Promise<LeadWithContact>;
  updateLead: (id: string, patch: UpdateLeadRequest) => Promise<Lead>;
  assignLead: (id: string, req: AssignLeadRequest) => Promise<Lead>;
  changeLeadStage: (id: string, req: ChangeLeadStageRequest) => Promise<Lead>;
  listLeadActivities: (
    id: string,
    opts?: { limit?: number; cursor?: string },
  ) => Promise<ActivityListResponse>;

  // Phase 1: inbox
  listThreads: (opts?: { limit?: number; cursor?: string }) => Promise<{
    items: MessageThread[];
    nextCursor: string | null;
  }>;
  listThreadMessages: (
    threadId: string,
    opts?: { limit?: number; cursor?: string },
  ) => Promise<{ items: Message[]; nextCursor: string | null }>;
  sendMessage: (req: SendMessageRequest) => Promise<Message>;

  // Phase 2: price book
  listPriceBook: (opts?: {
    kind?: PriceBookKind;
    includeArchived?: boolean;
    search?: string;
  }) => Promise<{ items: PriceBookItem[] }>;
  createPriceBookItem: (input: PriceBookItemInput) => Promise<PriceBookItem>;
  updatePriceBookItem: (id: string, patch: PriceBookItemPatch) => Promise<PriceBookItem>;
  deletePriceBookItem: (id: string) => Promise<void>;
  importPriceBook: (rows: Record<string, unknown>[]) => Promise<{
    inserted: number;
    updated: number;
    errors: Array<{ index: number; error: string }>;
  }>;
}

const ContactsListSchema = z.object({ items: z.array(ContactSchema) });
const ThreadsListSchema = z.object({
  items: z.array(MessageThreadSchema),
  nextCursor: z.string().uuid().nullable(),
});
const MessagesListSchema = z.object({
  items: z.array(MessageSchema),
  nextCursor: z.string().uuid().nullable(),
});

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value));
  }
  const s = sp.toString();
  return s.length > 0 ? `?${s}` : '';
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

    async listContacts(opts) {
      const q = buildQuery({ search: opts?.search, limit: opts?.limit });
      return request(`/contacts${q}`, ContactsListSchema, { method: 'GET' });
    },
    async getContact(id) {
      return request(`/contacts/${id}`, ContactSchema, { method: 'GET' });
    },
    async upsertContact(input) {
      return request('/contacts', ContactSchema, { method: 'POST', body: input });
    },
    async updateContact(id, patch) {
      return request(`/contacts/${id}`, ContactSchema, { method: 'PATCH', body: patch });
    },
    async mergeContacts(req) {
      return request('/contacts/merge', ContactSchema, { method: 'POST', body: req });
    },

    async listLeads(query) {
      const q = buildQuery({
        stage: query?.stage,
        ownerId: query?.ownerId,
        source: query?.source,
        search: query?.search,
        limit: query?.limit,
        cursor: query?.cursor,
      });
      return request(`/leads${q}`, LeadListResponseSchema, { method: 'GET' });
    },
    async createLead(req) {
      return request('/leads', LeadWithContactSchema, { method: 'POST', body: req });
    },
    async getLead(id) {
      return request(`/leads/${id}`, LeadWithContactSchema, { method: 'GET' });
    },
    async updateLead(id, patch) {
      return request(`/leads/${id}`, LeadSchema, { method: 'PATCH', body: patch });
    },
    async assignLead(id, req) {
      return request(`/leads/${id}/assign`, LeadSchema, { method: 'POST', body: req });
    },
    async changeLeadStage(id, req) {
      return request(`/leads/${id}/stage`, LeadSchema, { method: 'POST', body: req });
    },
    async listLeadActivities(id, opts) {
      const q = buildQuery({ limit: opts?.limit, cursor: opts?.cursor });
      return request(`/leads/${id}/activities${q}`, ActivityListResponseSchema, { method: 'GET' });
    },

    async listThreads(opts) {
      const q = buildQuery({ limit: opts?.limit, cursor: opts?.cursor });
      return request(`/threads${q}`, ThreadsListSchema, { method: 'GET' });
    },
    async listThreadMessages(threadId, opts) {
      const q = buildQuery({ limit: opts?.limit, cursor: opts?.cursor });
      return request(`/threads/${threadId}/messages${q}`, MessagesListSchema, { method: 'GET' });
    },
    async sendMessage(req) {
      return request('/messages', MessageSchema, { method: 'POST', body: req });
    },

    async listPriceBook(opts) {
      const q = buildQuery({
        kind: opts?.kind,
        includeArchived: opts?.includeArchived ? 'true' : undefined,
        search: opts?.search,
      });
      return request(`/price-book${q}`, PriceBookListResponseSchema, { method: 'GET' });
    },
    async createPriceBookItem(input) {
      return request('/price-book', PriceBookItemSchema, { method: 'POST', body: input });
    },
    async updatePriceBookItem(id, patch) {
      return request(`/price-book/${id}`, PriceBookItemSchema, {
        method: 'PATCH',
        body: patch,
      });
    },
    async deletePriceBookItem(id) {
      await request(`/price-book/${id}`, null, { method: 'DELETE' });
    },
    async importPriceBook(rows) {
      const ImportResponse = z.object({
        inserted: z.number().int(),
        updated: z.number().int(),
        errors: z.array(z.object({ index: z.number().int(), error: z.string() })),
      });
      return request('/price-book/import', ImportResponse, {
        method: 'POST',
        body: { rows },
      });
    },
  };
}

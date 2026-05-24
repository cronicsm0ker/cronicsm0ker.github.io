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
  AssetSchema,
  UploadTicketSchema,
  type Asset,
  type AssetOwnerType,
  type RequestUploadRequest,
  type UploadTicket,
  MeasurementSchema,
  type Measurement,
  type CreateMeasurement,
  type CreateManualPolygonMeasurement,
  ProposalSchema,
  ProposalWithVersionSchema,
  PublicProposalSchema,
  type Proposal,
  type ProposalWithVersion,
  type CreateProposalRequest,
  type UpdateProposalDraftRequest,
  type GenerateProposalRequest,
  type PublicProposal,
  type AcceptProposal,
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

  // Phase 2: assets
  requestAssetUpload: (req: RequestUploadRequest) => Promise<UploadTicket>;
  finalizeAssetUpload: (id: string, contentHash: string) => Promise<Asset>;
  getAsset: (id: string) => Promise<{ asset: Asset; downloadUrl: string | null }>;
  listAssets: (
    ownerType: AssetOwnerType,
    ownerId: string,
  ) => Promise<{ items: Asset[] }>;
  deleteAsset: (id: string) => Promise<void>;

  // Phase 2: measurements
  listMeasurements: (leadId: string) => Promise<{ items: Measurement[] }>;
  createMeasurement: (req: CreateMeasurement) => Promise<Measurement>;
  createPolygonMeasurement: (req: CreateManualPolygonMeasurement) => Promise<Measurement>;
  deleteMeasurement: (id: string) => Promise<void>;

  // Phase 2: proposals
  getProposal: (id: string) => Promise<ProposalWithVersion>;
  listLeadProposals: (leadId: string) => Promise<{ items: Proposal[] }>;
  createProposal: (req: CreateProposalRequest) => Promise<ProposalWithVersion>;
  generateProposal: (req: GenerateProposalRequest) => Promise<{
    proposal: ProposalWithVersion;
    generation: {
      confidence: number;
      reviewNotes: string[];
      modelUsed: string;
      cacheReadTokens: number;
    };
    publicToken: string;
  }>;
  updateProposalDraft: (
    id: string,
    patch: UpdateProposalDraftRequest,
  ) => Promise<ProposalWithVersion>;
  sendProposal: (id: string) => Promise<Proposal>;
  withdrawProposal: (id: string) => Promise<Proposal>;
  rotateProposalToken: (id: string) => Promise<{ token: string }>;

  // Public customer-portal calls
  getPublicProposal: (token: string) => Promise<PublicProposal & { proposalId: string }>;
  acceptPublicProposal: (
    token: string,
    body: AcceptProposal,
  ) => Promise<PublicProposal & { proposalId: string }>;
  rejectPublicProposal: (
    token: string,
    rejectionReason: string,
  ) => Promise<PublicProposal & { proposalId: string }>;
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

    async requestAssetUpload(req) {
      return request('/assets/upload-ticket', UploadTicketSchema, {
        method: 'POST',
        body: req,
      });
    },
    async finalizeAssetUpload(id, contentHash) {
      return request(`/assets/${id}/finalize`, AssetSchema, {
        method: 'POST',
        body: { contentHash },
      });
    },
    async getAsset(id) {
      const AssetWithUrl = z.object({
        asset: AssetSchema,
        downloadUrl: z.string().url().nullable(),
      });
      return request(`/assets/${id}`, AssetWithUrl, { method: 'GET' });
    },
    async listAssets(ownerType, ownerId) {
      const q = buildQuery({ ownerType, ownerId });
      const ListResp = z.object({ items: z.array(AssetSchema) });
      return request(`/assets${q}`, ListResp, { method: 'GET' });
    },
    async deleteAsset(id) {
      await request(`/assets/${id}`, null, { method: 'DELETE' });
    },

    async listMeasurements(leadId) {
      const ListResp = z.object({ items: z.array(MeasurementSchema) });
      return request(`/leads/${leadId}/measurements`, ListResp, { method: 'GET' });
    },
    async createMeasurement(req) {
      return request('/measurements', MeasurementSchema, { method: 'POST', body: req });
    },
    async createPolygonMeasurement(req) {
      return request('/measurements/polygon', MeasurementSchema, {
        method: 'POST',
        body: req,
      });
    },
    async deleteMeasurement(id) {
      await request(`/measurements/${id}`, null, { method: 'DELETE' });
    },

    async getProposal(id) {
      return request(`/proposals/${id}`, ProposalWithVersionSchema, { method: 'GET' });
    },
    async listLeadProposals(leadId) {
      const ListResp = z.object({ items: z.array(ProposalSchema) });
      return request(`/leads/${leadId}/proposals`, ListResp, { method: 'GET' });
    },
    async createProposal(req) {
      return request('/proposals', ProposalWithVersionSchema, {
        method: 'POST',
        body: req,
      });
    },
    async generateProposal(req) {
      const GenerateResp = z.object({
        proposal: ProposalWithVersionSchema,
        generation: z.object({
          confidence: z.number().int(),
          reviewNotes: z.array(z.string()),
          modelUsed: z.string(),
          cacheReadTokens: z.number().int(),
        }),
        publicToken: z.string(),
      });
      return request('/proposals/generate', GenerateResp, {
        method: 'POST',
        body: req,
      });
    },
    async updateProposalDraft(id, patch) {
      return request(`/proposals/${id}`, ProposalWithVersionSchema, {
        method: 'PATCH',
        body: patch,
      });
    },
    async sendProposal(id) {
      return request(`/proposals/${id}/send`, ProposalSchema, {
        method: 'POST',
        body: {},
      });
    },
    async withdrawProposal(id) {
      return request(`/proposals/${id}/withdraw`, ProposalSchema, {
        method: 'POST',
      });
    },
    async rotateProposalToken(id) {
      const TokenResp = z.object({ token: z.string() });
      return request(`/proposals/${id}/rotate-token`, TokenResp, {
        method: 'POST',
      });
    },

    async getPublicProposal(token) {
      const Resp = PublicProposalSchema.extend({ proposalId: z.string().uuid() });
      return request(`/portal/proposals/${token}`, Resp, { method: 'GET', auth: false });
    },
    async acceptPublicProposal(token, body) {
      const Resp = PublicProposalSchema.extend({ proposalId: z.string().uuid() });
      return request(`/portal/proposals/${token}/accept`, Resp, {
        method: 'POST',
        body,
        auth: false,
      });
    },
    async rejectPublicProposal(token, rejectionReason) {
      const Resp = PublicProposalSchema.extend({ proposalId: z.string().uuid() });
      return request(`/portal/proposals/${token}/reject`, Resp, {
        method: 'POST',
        body: { rejectionReason },
        auth: false,
      });
    },
  };
}

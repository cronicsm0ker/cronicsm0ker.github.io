import { z } from 'zod';
import { PriceBookKindSchema } from './price-book.js';

export const ProposalStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'WITHDRAWN',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

// Allowed transitions. Drafts can be edited until SENT. Sent proposals
// only move via customer action (VIEWED -> ACCEPTED / REJECTED) or org
// withdraw. EXPIRED is set by a background sweep.
export const PROPOSAL_STATUS_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  DRAFT: ['SENT', 'WITHDRAWN'],
  SENT: ['VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  VIEWED: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  ACCEPTED: [],
  REJECTED: ['DRAFT'],
  EXPIRED: ['DRAFT'],
  WITHDRAWN: ['DRAFT'],
};

export const ProposalLineItemSchema = z.object({
  // Frozen snapshot of a PriceBookItem at proposal time. We keep the
  // priceBookItemId for traceability but never read back through it.
  priceBookItemId: z.string().uuid().nullable(),
  kind: PriceBookKindSchema,
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  unit: z.string(),
  quantity: z.number().nonnegative(),
  unitCostCents: z.string(),
  markupBps: z.number().int().nonnegative(),
  wasteFactorBps: z.number().int().nonnegative(),
  // Server-computed: quantity * (1 + wasteFactor) * unitCost * (1 + markup).
  subtotalCents: z.string(),
});
export type ProposalLineItem = z.infer<typeof ProposalLineItemSchema>;

export const ProposalSnapshotSchema = z.object({
  title: z.string().min(1).max(200),
  scopeOfWork: z.string().max(20_000),
  lineItems: z.array(ProposalLineItemSchema).max(200),
  termsText: z.string().max(20_000),
  depositPercentBps: z.number().int().min(0).max(10_000),
  taxRateBps: z.number().int().min(0).max(5000),
  subtotalCents: z.string(),
  taxCents: z.string(),
  totalCents: z.string(),
  depositCents: z.string(),
  contactSnapshot: z.object({
    name: z.string(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
  }),
  measurementsSnapshot: z
    .array(
      z.object({
        id: z.string().uuid(),
        label: z.string(),
        value: z.string(),
        unit: z.string(),
      }),
    )
    .optional(),
  // AI fields when generatedByAi=true.
  aiReviewNotes: z.array(z.string()).optional(),
});
export type ProposalSnapshot = z.infer<typeof ProposalSnapshotSchema>;

export const ProposalSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  leadId: z.string().uuid(),
  contactId: z.string().uuid(),
  status: ProposalStatusSchema,
  currentVersionId: z.string().uuid().nullable().optional(),
  generatedByAi: z.boolean(),
  aiConfidence: z.number().int().min(0).max(100).nullable().optional(),
  sentAt: z.string().datetime().nullable().optional(),
  viewedAt: z.string().datetime().nullable().optional(),
  acceptedAt: z.string().datetime().nullable().optional(),
  rejectedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const ProposalWithVersionSchema = ProposalSchema.extend({
  currentVersion: z
    .object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      snapshot: ProposalSnapshotSchema,
      totalCents: z.string(),
      depositCents: z.string(),
      taxRateBps: z.number().int(),
      createdAt: z.string().datetime(),
    })
    .nullable(),
});
export type ProposalWithVersion = z.infer<typeof ProposalWithVersionSchema>;

export const ProposalLineItemInputSchema = z.object({
  priceBookItemId: z.string().uuid().optional(),
  kind: PriceBookKindSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  unit: z.string().min(1).max(50),
  quantity: z.number().nonnegative(),
  unitCostCents: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  markupBps: z.number().int().min(0).max(50_000).default(3000),
  wasteFactorBps: z.number().int().min(0).max(10_000).default(0),
});
export type ProposalLineItemInput = z.infer<typeof ProposalLineItemInputSchema>;

export const CreateProposalRequestSchema = z.object({
  leadId: z.string().uuid(),
  title: z.string().min(1).max(200),
  scopeOfWork: z.string().max(20_000).default(''),
  lineItems: z.array(ProposalLineItemInputSchema).max(200).default([]),
  termsText: z.string().max(20_000).default(''),
  depositPercentBps: z.number().int().min(0).max(10_000).default(2500),
  taxRateBps: z.number().int().min(0).max(5000).default(0),
  expiresInDays: z.number().int().positive().max(180).optional(),
  measurementIds: z.array(z.string().uuid()).optional(),
});
export type CreateProposalRequest = z.infer<typeof CreateProposalRequestSchema>;

export const UpdateProposalDraftSchema = CreateProposalRequestSchema.omit({
  leadId: true,
}).partial();
export type UpdateProposalDraftRequest = z.infer<typeof UpdateProposalDraftSchema>;

export const SendProposalRequestSchema = z.object({
  channel: z.enum(['WHATSAPP', 'IMESSAGE', 'SMS', 'EMAIL', 'TELEGRAM']).optional(),
  message: z.string().max(4000).optional(),
});
export type SendProposalRequest = z.infer<typeof SendProposalRequestSchema>;

export const GenerateProposalRequestSchema = z.object({
  leadId: z.string().uuid(),
  jobType: z.string().min(1).max(200),
  scopeHints: z.string().max(4000).optional(),
  measurementIds: z.array(z.string().uuid()).optional(),
  assetIds: z.array(z.string().uuid()).optional(),
});
export type GenerateProposalRequest = z.infer<typeof GenerateProposalRequestSchema>;

// Returned by the customer portal's public endpoint. Strips internal
// fields and leaks only what's safe for the homeowner to see.
export const PublicProposalSchema = z.object({
  id: z.string().uuid(),
  status: ProposalStatusSchema,
  orgName: z.string(),
  snapshot: ProposalSnapshotSchema,
  totalCents: z.string(),
  depositCents: z.string(),
  expiresAt: z.string().datetime().nullable().optional(),
  acceptedAt: z.string().datetime().nullable().optional(),
});
export type PublicProposal = z.infer<typeof PublicProposalSchema>;

export const AcceptProposalSchema = z.object({
  signerName: z.string().min(1).max(200),
  // Optional rejection text — when the customer hits "decline" instead.
  rejectionReason: z.string().max(2000).optional(),
});
export type AcceptProposal = z.infer<typeof AcceptProposalSchema>;

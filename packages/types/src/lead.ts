import { z } from 'zod';
import { ContactSchema, ContactInputSchema } from './contact.js';

export const LeadStageSchema = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'ESTIMATING',
  'PROPOSAL_SENT',
  'WON',
  'LOST',
  'DORMANT',
]);
export type LeadStage = z.infer<typeof LeadStageSchema>;

export const LeadSourceSchema = z.enum([
  'WEB_FORM',
  'META_ADS',
  'GOOGLE_ADS',
  'TIKTOK_ADS',
  'WHATSAPP',
  'SMS',
  'IMESSAGE',
  'EMAIL',
  'TELEGRAM',
  'PHONE',
  'MANUAL',
  'CSV_IMPORT',
  'REFERRAL',
  'OTHER',
]);
export type LeadSource = z.infer<typeof LeadSourceSchema>;

// Stages a lead can move to FROM each starting stage. Backwards moves are
// allowed for NEW / CONTACTED / QUALIFIED / ESTIMATING so reps can correct
// mistakes; terminal stages (WON / LOST / DORMANT) require an explicit reopen.
export const LEAD_STAGE_TRANSITIONS: Record<LeadStage, readonly LeadStage[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'LOST', 'DORMANT'],
  CONTACTED: ['NEW', 'QUALIFIED', 'ESTIMATING', 'LOST', 'DORMANT'],
  QUALIFIED: ['CONTACTED', 'ESTIMATING', 'LOST', 'DORMANT'],
  ESTIMATING: ['QUALIFIED', 'PROPOSAL_SENT', 'LOST', 'DORMANT'],
  PROPOSAL_SENT: ['ESTIMATING', 'WON', 'LOST', 'DORMANT'],
  WON: ['PROPOSAL_SENT'],
  LOST: ['NEW'],
  DORMANT: ['NEW'],
};

export const LeadSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  contactId: z.string().uuid(),
  ownerId: z.string().uuid().nullable().optional(),
  stage: LeadStageSchema,
  source: LeadSourceSchema,
  sourceMeta: z.record(z.unknown()).nullable().optional(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  firstRespondedAt: z.string().datetime().nullable().optional(),
  slaBreachedAt: z.string().datetime().nullable().optional(),
  wonAt: z.string().datetime().nullable().optional(),
  lostAt: z.string().datetime().nullable().optional(),
  lostReason: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Lead = z.infer<typeof LeadSchema>;

export const LeadWithContactSchema = LeadSchema.extend({
  contact: ContactSchema,
});
export type LeadWithContact = z.infer<typeof LeadWithContactSchema>;

export const CreateLeadRequestSchema = z.object({
  contact: ContactInputSchema,
  source: LeadSourceSchema.default('MANUAL'),
  title: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
  ownerId: z.string().uuid().optional(),
  sourceMeta: z.record(z.unknown()).optional(),
});
export type CreateLeadRequest = z.infer<typeof CreateLeadRequestSchema>;

export const UpdateLeadRequestSchema = z.object({
  title: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  lostReason: z.string().max(500).optional(),
});
export type UpdateLeadRequest = z.infer<typeof UpdateLeadRequestSchema>;

export const ChangeLeadStageRequestSchema = z.object({
  stage: LeadStageSchema,
  lostReason: z.string().max(500).optional(),
});
export type ChangeLeadStageRequest = z.infer<typeof ChangeLeadStageRequestSchema>;

export const AssignLeadRequestSchema = z.object({
  ownerId: z.string().uuid().nullable(),
});
export type AssignLeadRequest = z.infer<typeof AssignLeadRequestSchema>;

export const LeadListQuerySchema = z.object({
  stage: LeadStageSchema.optional(),
  ownerId: z.string().uuid().optional(),
  source: LeadSourceSchema.optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});
export type LeadListQuery = z.infer<typeof LeadListQuerySchema>;

export const LeadListResponseSchema = z.object({
  items: z.array(LeadWithContactSchema),
  nextCursor: z.string().uuid().nullable(),
});
export type LeadListResponse = z.infer<typeof LeadListResponseSchema>;

export const LeadIngestSchema = z.object({
  source: LeadSourceSchema,
  channel: z
    .enum(['WHATSAPP', 'IMESSAGE', 'SMS', 'EMAIL', 'TELEGRAM', 'WEB_FORM'])
    .optional(),
  externalId: z.string().max(256).optional(),
  contact: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    phone: z.string().min(3).max(32).optional(),
  }),
  message: z
    .object({
      body: z.string().min(1).max(8000),
      externalId: z.string().max(256).optional(),
    })
    .optional(),
  title: z.string().max(200).optional(),
  meta: z.record(z.unknown()).optional(),
});
export type LeadIngest = z.infer<typeof LeadIngestSchema>;

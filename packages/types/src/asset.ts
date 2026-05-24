import { z } from 'zod';

export const AssetKindSchema = z.enum([
  'PHOTO',
  'BLUEPRINT',
  'DOCUMENT',
  'PROPOSAL_PDF',
  'SIGNED_CONTRACT',
  'THUMBNAIL',
  'OTHER',
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetStatusSchema = z.enum(['PENDING', 'READY', 'REJECTED']);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

export const AssetOwnerTypeSchema = z.enum(['CONTACT', 'LEAD', 'PROPOSAL']);
export type AssetOwnerType = z.infer<typeof AssetOwnerTypeSchema>;

export const AssetSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  ownerType: AssetOwnerTypeSchema,
  ownerId: z.string().uuid(),
  kind: AssetKindSchema,
  mimeType: z.string(),
  sizeBytes: z.string(),
  s3Key: z.string(),
  thumbnailKey: z.string().nullable().optional(),
  contentHash: z.string(),
  status: AssetStatusSchema,
  uploadedBy: z.string().uuid().nullable().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Asset = z.infer<typeof AssetSchema>;

// MIME types we accept on upload. Anything else is rejected before the
// signed URL is issued, so the client can't talk the API into a bad mime.
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const RequestUploadSchema = z.object({
  ownerType: AssetOwnerTypeSchema,
  ownerId: z.string().uuid(),
  kind: AssetKindSchema,
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024), // 50 MB cap
  filename: z.string().max(255).optional(),
});
export type RequestUploadRequest = z.infer<typeof RequestUploadSchema>;

export const UploadTicketSchema = z.object({
  assetId: z.string().uuid(),
  uploadUrl: z.string().url(),
  uploadMethod: z.enum(['PUT', 'POST']),
  // Headers the client must include when PUTting to uploadUrl. The
  // signed URL embeds Content-Type, so the client must echo it.
  headers: z.record(z.string()),
  // Lifetime so the client knows when to retry the ticket flow.
  expiresAt: z.string().datetime(),
});
export type UploadTicket = z.infer<typeof UploadTicketSchema>;

export const FinalizeUploadSchema = z.object({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'contentHash must be SHA-256 hex'),
});
export type FinalizeUploadRequest = z.infer<typeof FinalizeUploadSchema>;

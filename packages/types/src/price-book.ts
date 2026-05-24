import { z } from 'zod';

export const PriceBookKindSchema = z.enum(['MATERIAL', 'LABOR', 'FEE']);
export type PriceBookKind = z.infer<typeof PriceBookKindSchema>;

export const PriceBookItemSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  kind: PriceBookKindSchema,
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  unit: z.string().min(1).max(50),
  unitCostCents: z.string(), // BigInt serialized as string over the wire
  markupBps: z.number().int().min(0).max(50_000),
  wasteFactorBps: z.number().int().min(0).max(10_000),
  sku: z.string().nullable().optional(),
  archivedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PriceBookItem = z.infer<typeof PriceBookItemSchema>;

export const PriceBookItemInputSchema = z.object({
  kind: PriceBookKindSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  unit: z.string().min(1).max(50),
  unitCostCents: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  markupBps: z.number().int().min(0).max(50_000).default(3000),
  wasteFactorBps: z.number().int().min(0).max(10_000).default(1000),
  sku: z.string().max(100).optional(),
});
export type PriceBookItemInput = z.infer<typeof PriceBookItemInputSchema>;

export const PriceBookItemPatchSchema = PriceBookItemInputSchema.partial().extend({
  archived: z.boolean().optional(),
});
export type PriceBookItemPatch = z.infer<typeof PriceBookItemPatchSchema>;

export const PriceBookCsvImportSchema = z.object({
  // Each row is the same shape as PriceBookItemInput. We validate per-row
  // and accumulate errors so the user gets a useful diff.
  rows: z.array(PriceBookItemInputSchema).max(5000),
});
export type PriceBookCsvImport = z.infer<typeof PriceBookCsvImportSchema>;

export const PriceBookListResponseSchema = z.object({
  items: z.array(PriceBookItemSchema),
});
export type PriceBookListResponse = z.infer<typeof PriceBookListResponseSchema>;

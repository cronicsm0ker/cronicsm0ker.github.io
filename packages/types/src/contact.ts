import { z } from 'zod';
import { MessageChannelSchema } from './messaging.js';

export const ContactSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  preferredChannel: MessageChannelSchema.nullable().optional(),
  optedOutAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const ContactInputSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().min(3).max(32).optional(),
  notes: z.string().max(2000).optional(),
  preferredChannel: MessageChannelSchema.optional(),
});
export type ContactInput = z.infer<typeof ContactInputSchema>;

export const ContactPatchSchema = ContactInputSchema.partial();
export type ContactPatch = z.infer<typeof ContactPatchSchema>;

export const ContactMergeRequestSchema = z.object({
  keepId: z.string().uuid(),
  discardId: z.string().uuid(),
});
export type ContactMergeRequest = z.infer<typeof ContactMergeRequestSchema>;

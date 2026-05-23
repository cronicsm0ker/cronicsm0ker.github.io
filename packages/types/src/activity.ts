import { z } from 'zod';

export const ActivityKindSchema = z.enum([
  'LEAD_CREATED',
  'LEAD_STAGE_CHANGED',
  'LEAD_ASSIGNED',
  'LEAD_NOTE',
  'MESSAGE_INBOUND',
  'MESSAGE_OUTBOUND',
  'CALL_LOGGED',
  'PROPOSAL_SENT',
  'PROPOSAL_VIEWED',
  'PROPOSAL_ACCEPTED',
  'CONTACT_MERGED',
  'CHANNEL_OPTED_OUT',
]);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;

export const ActivitySchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  kind: ActivityKindSchema,
  contactId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
  messageId: z.string().uuid().nullable().optional(),
  actorId: z.string().uuid().nullable().optional(),
  payload: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string().datetime(),
});
export type Activity = z.infer<typeof ActivitySchema>;

export const ActivityListResponseSchema = z.object({
  items: z.array(ActivitySchema),
  nextCursor: z.string().uuid().nullable(),
});
export type ActivityListResponse = z.infer<typeof ActivityListResponseSchema>;

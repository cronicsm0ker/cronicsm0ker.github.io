import { z } from 'zod';

export const MessageChannelSchema = z.enum([
  'WHATSAPP',
  'IMESSAGE',
  'SMS',
  'EMAIL',
  'TELEGRAM',
  'WEB_FORM',
]);
export type MessageChannel = z.infer<typeof MessageChannelSchema>;

export const MessageDirectionSchema = z.enum(['INBOUND', 'OUTBOUND']);
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;

export const MessageStatusSchema = z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageAttachmentSchema = z.object({
  url: z.string().url(),
  contentType: z.string().min(1),
  filename: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  threadId: z.string().uuid(),
  direction: MessageDirectionSchema,
  channel: MessageChannelSchema,
  body: z.string(),
  externalId: z.string().nullable().optional(),
  status: MessageStatusSchema,
  sentBy: z.string().uuid().nullable().optional(),
  attachments: z.array(MessageAttachmentSchema).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MessageThreadSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  contactId: z.string().uuid(),
  leadId: z.string().uuid().nullable().optional(),
  channel: MessageChannelSchema,
  externalId: z.string().nullable().optional(),
  lastMessageAt: z.string().datetime().nullable().optional(),
  unreadCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MessageThread = z.infer<typeof MessageThreadSchema>;

export const SendMessageRequestSchema = z.object({
  threadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  channel: MessageChannelSchema.optional(),
  body: z.string().min(1).max(4096),
  attachments: z.array(MessageAttachmentSchema).optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

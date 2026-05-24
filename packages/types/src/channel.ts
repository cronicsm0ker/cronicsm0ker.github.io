import { z } from 'zod';
import { MessageChannelSchema } from './messaging.js';

export const ChannelCredentialPublicSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  channel: MessageChannelSchema,
  label: z.string(),
  // `config` is intentionally omitted from the public shape — it contains
  // provider secrets (access tokens, auth tokens, signing keys). Only the
  // webhook URL is safe to surface to the UI.
  webhookPath: z.string().nullable(),
  hasWebhookToken: z.boolean(),
  disabledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ChannelCredentialPublic = z.infer<typeof ChannelCredentialPublicSchema>;

// Per-channel config shapes. Each adapter validates the relevant slice on
// boot so misconfiguration surfaces immediately rather than at webhook time.

export const TwilioConfigSchema = z.object({
  accountSid: z.string().startsWith('AC'),
  authToken: z.string().min(8),
  fromNumber: z.string().regex(/^\+[1-9]\d{1,14}$/),
});
export type TwilioConfig = z.infer<typeof TwilioConfigSchema>;

export const WhatsAppConfigSchema = z.object({
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  appSecret: z.string().min(1),
  verifyToken: z.string().min(8),
});
export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

export const MetaAdsConfigSchema = z.object({
  pageId: z.string().min(1),
  pageAccessToken: z.string().min(1),
  appSecret: z.string().min(1),
  verifyToken: z.string().min(8),
});
export type MetaAdsConfig = z.infer<typeof MetaAdsConfigSchema>;

export const PostmarkConfigSchema = z.object({
  serverToken: z.string().min(8),
  fromAddress: z.string().email(),
  // Postmark inbound uses HTTP basic auth on the configured webhook URL.
  inboundUser: z.string().min(1),
  inboundPassword: z.string().min(8),
});
export type PostmarkConfig = z.infer<typeof PostmarkConfigSchema>;

export const TelegramConfigSchema = z.object({
  botToken: z.string().min(1),
  // Telegram webhook secret_token header value.
  secretToken: z.string().min(8),
});
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;

export const CreateChannelCredentialSchema = z.object({
  channel: MessageChannelSchema,
  label: z.string().min(1).max(100),
  config: z.record(z.unknown()),
});
export type CreateChannelCredentialRequest = z.infer<typeof CreateChannelCredentialSchema>;

export const UpdateChannelCredentialSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  config: z.record(z.unknown()).optional(),
  disabled: z.boolean().optional(),
});
export type UpdateChannelCredentialRequest = z.infer<typeof UpdateChannelCredentialSchema>;

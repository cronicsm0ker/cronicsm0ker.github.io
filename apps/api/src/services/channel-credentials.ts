import type { PrismaClient } from '@roofops/db';
import type {
  ChannelCredentialPublic,
  CreateChannelCredentialRequest,
  MessageChannel,
  UpdateChannelCredentialRequest,
} from '@roofops/types';
import {
  MetaAdsConfigSchema,
  PostmarkConfigSchema,
  TelegramConfigSchema,
  TwilioConfigSchema,
  WhatsAppConfigSchema,
} from '@roofops/types';
import type { AuthContext } from '../lib/auth-context.js';
import { Errors } from '../errors.js';
import { generateOpaqueToken } from '../lib/tokens.js';
import { AuditLogger } from './audit.js';

interface CredentialRow {
  id: string;
  orgId: string;
  channel: MessageChannel;
  label: string;
  config: unknown;
  webhookToken: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WEBHOOK_PATHS: Partial<Record<MessageChannel, string>> = {
  WEB_FORM: '/public/leads/web-form',
  WHATSAPP: '/webhooks/whatsapp',
  IMESSAGE: '/webhooks/imessage',
  SMS: '/webhooks/twilio-sms',
  EMAIL: '/webhooks/postmark',
  TELEGRAM: '/webhooks/telegram',
};

// Per-channel config validation so misconfiguration surfaces at save time.
function validateConfig(channel: MessageChannel, config: unknown): unknown {
  switch (channel) {
    case 'SMS':
      return TwilioConfigSchema.parse(config);
    case 'WHATSAPP':
      return WhatsAppConfigSchema.parse(config);
    case 'EMAIL':
      return PostmarkConfigSchema.parse(config);
    case 'TELEGRAM':
      return TelegramConfigSchema.parse(config);
    case 'IMESSAGE':
      // The third-party iMessage gateway varies per vendor; accept any
      // shape for now and validate at adapter boot.
      return config;
    case 'WEB_FORM':
      return config ?? {};
    default:
      return config;
  }
}

// Adapters that authenticate inbound payloads against credentials need
// access to the raw config. This module owns the only fetch path so we
// never leak config through the public API.
export interface ChannelLookup {
  findByToken: (token: string) => Promise<CredentialRow | null>;
  findByOrgAndChannel: (orgId: string, channel: MessageChannel) => Promise<CredentialRow[]>;
}

function toPublic(row: CredentialRow): ChannelCredentialPublic {
  return {
    id: row.id,
    orgId: row.orgId,
    channel: row.channel,
    label: row.label,
    webhookPath: WEBHOOK_PATHS[row.channel] ?? null,
    hasWebhookToken: row.webhookToken !== null,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class ChannelCredentialsService implements ChannelLookup {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditLogger,
  ) {}

  async list(ctx: AuthContext): Promise<ChannelCredentialPublic[]> {
    const rows = await this.prisma.channelCredential.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toPublic);
  }

  async create(
    ctx: AuthContext,
    req: CreateChannelCredentialRequest,
  ): Promise<ChannelCredentialPublic & { webhookToken: string | null }> {
    this.requireAdmin(ctx);
    const config = validateConfig(req.channel, req.config);

    const webhookToken = WEBHOOK_PATHS[req.channel] ? generateOpaqueToken(24) : null;
    const created = await this.prisma.channelCredential.create({
      data: {
        orgId: ctx.orgId,
        channel: req.channel,
        label: req.label,
        config: config as never,
        webhookToken,
      },
    });

    await this.audit.log(ctx, {
      action: 'channel_credential.created',
      entityType: 'ChannelCredential',
      entityId: created.id,
      after: { channel: req.channel, label: req.label },
    });

    return { ...toPublic(created), webhookToken };
  }

  async update(
    ctx: AuthContext,
    id: string,
    patch: UpdateChannelCredentialRequest,
  ): Promise<ChannelCredentialPublic> {
    this.requireAdmin(ctx);
    const existing = await this.prisma.channelCredential.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!existing) throw Errors.notFound('Channel credential not found');

    const updated = await this.prisma.channelCredential.update({
      where: { id },
      data: {
        label: patch.label ?? existing.label,
        config: patch.config
          ? (validateConfig(existing.channel, patch.config) as never)
          : (existing.config as never),
        disabledAt:
          patch.disabled === undefined
            ? existing.disabledAt
            : patch.disabled
              ? existing.disabledAt ?? new Date()
              : null,
      },
    });
    await this.audit.log(ctx, {
      action: 'channel_credential.updated',
      entityType: 'ChannelCredential',
      entityId: id,
      before: { label: existing.label, disabled: !!existing.disabledAt },
      after: { label: updated.label, disabled: !!updated.disabledAt },
    });
    return toPublic(updated);
  }

  async rotateWebhookToken(ctx: AuthContext, id: string): Promise<{ webhookToken: string }> {
    this.requireAdmin(ctx);
    const existing = await this.prisma.channelCredential.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!existing) throw Errors.notFound('Channel credential not found');
    if (!WEBHOOK_PATHS[existing.channel]) {
      throw Errors.conflict('Channel does not support webhook tokens');
    }
    const newToken = generateOpaqueToken(24);
    await this.prisma.channelCredential.update({
      where: { id },
      data: { webhookToken: newToken },
    });
    await this.audit.log(ctx, {
      action: 'channel_credential.token_rotated',
      entityType: 'ChannelCredential',
      entityId: id,
    });
    return { webhookToken: newToken };
  }

  async delete(ctx: AuthContext, id: string): Promise<void> {
    this.requireAdmin(ctx);
    const existing = await this.prisma.channelCredential.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!existing) throw Errors.notFound('Channel credential not found');
    await this.prisma.channelCredential.delete({ where: { id } });
    await this.audit.log(ctx, {
      action: 'channel_credential.deleted',
      entityType: 'ChannelCredential',
      entityId: id,
      before: { channel: existing.channel, label: existing.label },
    });
  }

  // ---- ChannelLookup (consumed by inbound webhook adapters) ----

  async findByToken(token: string): Promise<CredentialRow | null> {
    return this.prisma.channelCredential.findUnique({ where: { webhookToken: token } });
  }

  async findByOrgAndChannel(orgId: string, channel: MessageChannel): Promise<CredentialRow[]> {
    return this.prisma.channelCredential.findMany({
      where: { orgId, channel, disabledAt: null },
    });
  }

  private requireAdmin(ctx: AuthContext): void {
    if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
      throw Errors.forbidden('Only owners and admins can manage channel credentials');
    }
  }
}

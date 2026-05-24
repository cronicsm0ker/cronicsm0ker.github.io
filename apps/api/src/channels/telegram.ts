// Telegram Bot inbound adapter.
//
// Telegram POSTs updates to the configured webhook URL with a
// X-Telegram-Bot-Api-Secret-Token header set to the value supplied when
// the webhook was registered via setWebhook(?secret_token=...). We use
// that header as the authentication mechanism — Telegram does not sign
// the body.
//
// Webhook URL: https://api.example.com/webhooks/telegram?token=<credential.webhookToken>

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TelegramConfigSchema } from '@roofops/types';
import { Errors } from '../errors.js';
import { verifyTelegramSecretToken } from '../lib/webhook-verify.js';
import { authContextFromCredential } from './_lib.js';
import { ContactsService } from '../services/contacts.js';
import { LeadsService } from '../services/leads.js';
import { AuditLogger } from '../services/audit.js';

const QuerySchema = z.object({ token: z.string().min(1).max(256) });

const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number(),
      from: z.object({
        id: z.number(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
      }),
      chat: z.object({ id: z.number(), type: z.string() }),
      date: z.number(),
      text: z.string().optional(),
    })
    .optional(),
});

export async function telegramChannel(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const contacts = new ContactsService(app.prisma, audit);
  const leads = new LeadsService(app.prisma, audit, contacts);
  const messages = app.messages;

  app.post('/webhooks/telegram', async (request, reply) => {
    const { token } = QuerySchema.parse(request.query);
    const credential = await app.channelCredentials.findByToken(token);
    if (!credential || credential.channel !== 'TELEGRAM' || credential.disabledAt) {
      throw Errors.unauthorized('Invalid or disabled webhook token');
    }
    const config = TelegramConfigSchema.parse(credential.config);

    const valid = verifyTelegramSecretToken({
      expected: config.secretToken,
      header: request.headers['x-telegram-bot-api-secret-token'] as string | undefined,
    });
    if (!valid) {
      request.log.warn({ channel: 'TELEGRAM' }, 'Telegram secret_token rejected');
      throw Errors.unauthorized('Secret token mismatch');
    }

    const update = TelegramUpdateSchema.parse(request.body);
    if (!update.message?.text) {
      // Non-text or non-message update (edited_message, callback_query, etc.).
      // Acknowledge without ingesting — extend in Phase 2 as needed.
      return reply.status(200).send({ ignored: true });
    }

    const ctx = authContextFromCredential(credential, request);
    const msg = update.message;
    const displayName =
      msg.from.username
        ? `@${msg.from.username}`
        : [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || `Telegram ${msg.from.id}`;

    const externalContactKey = `tg:${msg.from.id}`;

    const { contact } = await contacts.findOrCreate(ctx, {
      name: displayName,
      // Telegram doesn't give us a phone number; we use the chat id as the
      // dedup key by stashing it as the phone field for now. Refine when we
      // expose multi-channel handles in Phase 2.
      phone: externalContactKey,
    });

    let thread = await app.prisma.messageThread.findFirst({
      where: { orgId: ctx.orgId, contactId: contact.id, channel: 'TELEGRAM' },
      orderBy: { createdAt: 'desc' },
    });

    let leadId = thread?.leadId ?? null;
    if (!leadId) {
      const lead = await leads.ingest(ctx, {
        source: 'TELEGRAM',
        channel: 'TELEGRAM',
        contact: { name: displayName },
        title: msg.text.slice(0, 80) || 'Telegram lead',
        message: { body: msg.text, externalId: String(msg.message_id) },
        meta: { chatId: msg.chat.id, telegramUserId: msg.from.id },
      });
      leadId = lead.id;
    }

    await messages.recordInbound(ctx, {
      contactId: contact.id,
      channel: 'TELEGRAM',
      body: msg.text,
      externalThreadId: String(msg.chat.id),
      externalMessageId: String(msg.message_id),
      leadId,
    });

    return reply.status(200).send({ received: true });
  });
}

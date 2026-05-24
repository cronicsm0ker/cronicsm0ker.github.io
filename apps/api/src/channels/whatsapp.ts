// WhatsApp Cloud API inbound adapter.
//
// Meta sends two kinds of requests on the same webhook URL:
//   GET  ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...  -> respond with challenge
//   POST { object: "whatsapp_business_account", entry: [...] }       -> message events
//
// Inbound POST bodies are HMAC-SHA256 signed with the app secret on
// X-Hub-Signature-256: "sha256=<hex>" over the raw request body.
//
// Configure Meta's webhook to:
//   https://api.example.com/webhooks/whatsapp?token=<credential.webhookToken>

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WhatsAppConfigSchema } from '@roofops/types';
import { Errors } from '../errors.js';
import { verifyMetaSignature } from '../lib/webhook-verify.js';
import { authContextFromCredential } from './_lib.js';
import { ContactsService } from '../services/contacts.js';
import { LeadsService } from '../services/leads.js';
import { AuditLogger } from '../services/audit.js';

const QuerySchema = z.object({ token: z.string().min(1).max(256) });

const WhatsAppValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: z.object({ display_phone_number: z.string(), phone_number_id: z.string() }),
  contacts: z
    .array(
      z.object({
        profile: z.object({ name: z.string() }).optional(),
        wa_id: z.string(),
      }),
    )
    .optional(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        from: z.string(),
        timestamp: z.string(),
        type: z.string(),
        text: z.object({ body: z.string() }).optional(),
      }),
    )
    .optional(),
});

const WhatsAppPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: WhatsAppValueSchema,
        }),
      ),
    }),
  ),
});

export async function whatsappChannel(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const contacts = new ContactsService(app.prisma, audit);
  const leads = new LeadsService(app.prisma, audit, contacts);
  const messages = app.messages;

  // GET handshake for webhook subscription.
  app.get('/webhooks/whatsapp', async (request, reply) => {
    const { token } = QuerySchema.parse(request.query);
    const credential = await app.channelCredentials.findByToken(token);
    if (!credential || credential.channel !== 'WHATSAPP') {
      throw Errors.unauthorized('Invalid token');
    }
    const config = WhatsAppConfigSchema.parse(credential.config);

    const hub = z
      .object({
        'hub.mode': z.string(),
        'hub.verify_token': z.string(),
        'hub.challenge': z.string(),
      })
      .parse(request.query);

    if (hub['hub.mode'] !== 'subscribe' || hub['hub.verify_token'] !== config.verifyToken) {
      throw Errors.forbidden('Verify token mismatch');
    }
    reply.header('Content-Type', 'text/plain');
    return reply.send(hub['hub.challenge']);
  });

  app.post('/webhooks/whatsapp', async (request: FastifyRequest, reply) => {
    const { token } = QuerySchema.parse(request.query);
    const credential = await app.channelCredentials.findByToken(token);
    if (!credential || credential.channel !== 'WHATSAPP' || credential.disabledAt) {
      throw Errors.unauthorized('Invalid or disabled webhook token');
    }
    const config = WhatsAppConfigSchema.parse(credential.config);

    const valid = verifyMetaSignature({
      appSecret: config.appSecret,
      rawBody: request.rawBody ?? '',
      signatureHeader: request.headers['x-hub-signature-256'] as string | undefined,
    });
    if (!valid) {
      request.log.warn({ channel: 'WHATSAPP' }, 'WhatsApp signature rejected');
      throw Errors.unauthorized('Signature verification failed');
    }

    const payload = WhatsAppPayloadSchema.parse(request.body);
    const ctx = authContextFromCredential(credential, request);

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const { messages: msgs, contacts: contactsArr } = change.value;
        if (!msgs?.length) continue;

        for (const msg of msgs) {
          const profile = contactsArr?.find((c) => c.wa_id === msg.from);
          const body = msg.text?.body ?? `[${msg.type} message]`;
          const phone = `+${msg.from}`;

          const { contact } = await contacts.findOrCreate(ctx, {
            name: profile?.profile?.name ?? phone,
            phone,
          });

          let thread = await app.prisma.messageThread.findFirst({
            where: { orgId: ctx.orgId, contactId: contact.id, channel: 'WHATSAPP' },
            orderBy: { createdAt: 'desc' },
          });

          let leadId = thread?.leadId ?? null;
          if (!leadId) {
            const lead = await leads.ingest(ctx, {
              source: 'WHATSAPP',
              channel: 'WHATSAPP',
              contact: { name: contact.name, phone },
              title: body.slice(0, 80) || 'WhatsApp lead',
              message: { body, externalId: msg.id },
              meta: { phoneNumberId: change.value.metadata.phone_number_id },
            });
            leadId = lead.id;
          }

          await messages.recordInbound(ctx, {
            contactId: contact.id,
            channel: 'WHATSAPP',
            body,
            externalThreadId: msg.from,
            externalMessageId: msg.id,
            leadId,
          });
        }
      }
    }

    return reply.status(200).send({ received: true });
  });
}

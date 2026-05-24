// Twilio SMS inbound adapter.
//
// Twilio POSTs application/x-www-form-urlencoded payloads with signed
// X-Twilio-Signature: HMAC-SHA1 over (full URL + sorted params concatenated)
// using the account auth token as the key. The signed URL must match the
// configured webhook URL EXACTLY, including the per-org token query string.
//
// Configure Twilio's "A message comes in" webhook to:
//   POST https://api.example.com/webhooks/twilio-sms?token=<credential.webhookToken>

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TwilioConfigSchema } from '@roofops/types';
import { Errors } from '../errors.js';
import { verifyTwilioSignature } from '../lib/webhook-verify.js';
import { authContextFromCredential } from './_lib.js';
import { ContactsService } from '../services/contacts.js';
import { LeadsService } from '../services/leads.js';
import { MessagesService } from '../services/messages.js';
import { AuditLogger } from '../services/audit.js';

const QuerySchema = z.object({ token: z.string().min(1).max(256) });

// Subset of Twilio's payload — see https://www.twilio.com/docs/messaging/twiml#request-parameters
const TwilioPayloadSchema = z.object({
  MessageSid: z.string(),
  From: z.string(),
  To: z.string(),
  Body: z.string().default(''),
  ProfileName: z.string().optional(),
  NumMedia: z.string().optional(),
});

export async function twilioSmsChannel(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const contacts = new ContactsService(app.prisma, audit);
  const leads = new LeadsService(app.prisma, audit, contacts);
  const messages = app.messages;

  app.post('/webhooks/twilio-sms', async (request, reply) => {
    const { token } = QuerySchema.parse(request.query);
    const credential = await app.channelCredentials.findByToken(token);
    if (!credential || credential.channel !== 'SMS' || credential.disabledAt) {
      throw Errors.unauthorized('Invalid or disabled webhook token');
    }
    const config = TwilioConfigSchema.parse(credential.config);

    const reconstructedUrl = `${(request.headers['x-forwarded-proto'] as string) ?? request.protocol}://${
      (request.headers['x-forwarded-host'] as string) ?? request.headers.host
    }${request.url}`;
    const params = (request.body ?? {}) as Record<string, string>;

    const valid = verifyTwilioSignature({
      authToken: config.authToken,
      url: reconstructedUrl,
      params,
      signatureHeader: request.headers['x-twilio-signature'] as string | undefined,
    });
    if (!valid) {
      request.log.warn({ channel: 'SMS' }, 'Twilio signature rejected');
      throw Errors.unauthorized('Signature verification failed');
    }

    const payload = TwilioPayloadSchema.parse(params);
    const ctx = authContextFromCredential(credential, request);

    const { contact } = await contacts.findOrCreate(ctx, {
      name: payload.ProfileName ?? payload.From,
      phone: payload.From,
    });

    const existingThread = await app.prisma.messageThread.findFirst({
      where: { orgId: ctx.orgId, contactId: contact.id, channel: 'SMS' },
      orderBy: { createdAt: 'desc' },
    });

    let leadId = existingThread?.leadId ?? null;
    if (!leadId) {
      const lead = await leads.ingest(ctx, {
        source: 'SMS',
        channel: 'SMS',
        contact: { name: contact.name, phone: contact.phone ?? payload.From },
        title: payload.Body.slice(0, 80) || 'SMS lead',
        message: { body: payload.Body, externalId: payload.MessageSid },
        meta: { messageSid: payload.MessageSid, to: payload.To },
      });
      leadId = lead.id;
    }

    await messages.recordInbound(ctx, {
      contactId: contact.id,
      channel: 'SMS',
      body: payload.Body,
      externalThreadId: payload.From,
      externalMessageId: payload.MessageSid,
      leadId,
    });

    // Twilio expects a TwiML response (even if empty) within ~10s.
    reply.header('Content-Type', 'text/xml');
    return reply.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
}

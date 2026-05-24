// Postmark inbound email adapter.
//
// Postmark POSTs parsed inbound email as JSON to the configured webhook URL.
// Auth is HTTP Basic against credentials defined on the ChannelCredential.
// Per-org webhook URL: https://api.example.com/webhooks/postmark?token=<webhookToken>
//
// See: https://postmarkapp.com/developer/user-guide/inbound/parse-an-email

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PostmarkConfigSchema } from '@roofops/types';
import { Errors } from '../errors.js';
import { verifyBasicAuth } from '../lib/webhook-verify.js';
import { authContextFromCredential } from './_lib.js';
import { ContactsService } from '../services/contacts.js';
import { LeadsService } from '../services/leads.js';
import { AuditLogger } from '../services/audit.js';

const QuerySchema = z.object({ token: z.string().min(1).max(256) });

const PostmarkPayloadSchema = z.object({
  MessageID: z.string(),
  From: z.string().email(),
  FromName: z.string().optional(),
  To: z.string(),
  Subject: z.string().optional().default(''),
  TextBody: z.string().optional().default(''),
  HtmlBody: z.string().optional().default(''),
  StrippedTextReply: z.string().optional(),
  MessageStream: z.string().optional(),
  Headers: z
    .array(z.object({ Name: z.string(), Value: z.string() }))
    .optional(),
});

export async function postmarkChannel(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const contacts = new ContactsService(app.prisma, audit);
  const leads = new LeadsService(app.prisma, audit, contacts);
  const messages = app.messages;

  app.post('/webhooks/postmark', async (request, reply) => {
    const { token } = QuerySchema.parse(request.query);
    const credential = await app.channelCredentials.findByToken(token);
    if (!credential || credential.channel !== 'EMAIL' || credential.disabledAt) {
      throw Errors.unauthorized('Invalid or disabled webhook token');
    }
    const config = PostmarkConfigSchema.parse(credential.config);

    const valid = verifyBasicAuth({
      user: config.inboundUser,
      password: config.inboundPassword,
      header: request.headers.authorization,
    });
    if (!valid) {
      reply.header('WWW-Authenticate', 'Basic realm="roofops-inbound"');
      throw Errors.unauthorized('Basic auth failed');
    }

    const payload = PostmarkPayloadSchema.parse(request.body);
    const ctx = authContextFromCredential(credential, request);

    const body = (payload.StrippedTextReply?.length ?? 0) > 0
      ? payload.StrippedTextReply!
      : payload.TextBody;

    const { contact } = await contacts.findOrCreate(ctx, {
      name: payload.FromName ?? payload.From,
      email: payload.From,
    });

    let thread = await app.prisma.messageThread.findFirst({
      where: { orgId: ctx.orgId, contactId: contact.id, channel: 'EMAIL' },
      orderBy: { createdAt: 'desc' },
    });

    let leadId = thread?.leadId ?? null;
    if (!leadId) {
      const lead = await leads.ingest(ctx, {
        source: 'EMAIL',
        channel: 'EMAIL',
        contact: { name: contact.name, email: payload.From },
        title: payload.Subject || body.slice(0, 80) || 'Email lead',
        message: { body, externalId: payload.MessageID },
        meta: { to: payload.To, subject: payload.Subject, messageStream: payload.MessageStream },
      });
      leadId = lead.id;
    }

    await messages.recordInbound(ctx, {
      contactId: contact.id,
      channel: 'EMAIL',
      body,
      externalThreadId: payload.From,
      externalMessageId: payload.MessageID,
      leadId,
    });

    return reply.status(200).send({ received: true });
  });
}

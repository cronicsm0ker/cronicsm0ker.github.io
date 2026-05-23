// Reference channel adapter: public web-form ingest.
//
// Each contractor org provisions a ChannelCredential row with channel=WEB_FORM
// and a generated webhookToken. The embeddable form posts JSON to:
//
//   POST /public/leads/web-form?token=<webhookToken>
//
// We resolve the token -> orgId, build a synthetic AuthContext (no user; the
// audit log records this as system-initiated), and call LeadsService.ingest.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LeadIngestSchema } from '@roofops/types';
import { Errors } from '../errors.js';
import type { AuthContext } from '../lib/auth-context.js';
import { LeadsService } from '../services/leads.js';
import { ContactsService } from '../services/contacts.js';
import { MessagesService } from '../services/messages.js';
import { AuditLogger } from '../services/audit.js';

const QuerySchema = z.object({ token: z.string().min(1).max(256) });

const WebFormBodySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().min(3).max(32).optional(),
  message: z.string().max(8000).optional(),
  title: z.string().max(200).optional(),
  // Free-form attribution fields the embeddable widget forwards.
  meta: z.record(z.unknown()).optional(),
});

export async function webFormChannel(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const contacts = new ContactsService(app.prisma, audit);
  const leads = new LeadsService(app.prisma, audit, contacts);
  const messages = new MessagesService(app.prisma, audit);

  app.post('/public/leads/web-form', async (request, reply) => {
    const { token } = QuerySchema.parse(request.query);
    const body = WebFormBodySchema.parse(request.body);

    const credential = await app.prisma.channelCredential.findUnique({
      where: { webhookToken: token },
    });
    if (!credential || credential.channel !== 'WEB_FORM' || credential.disabledAt) {
      throw Errors.unauthorized('Invalid or disabled webhook token');
    }

    const ctx: AuthContext = {
      userId: '00000000-0000-0000-0000-000000000000',
      orgId: credential.orgId,
      role: 'MEMBER',
      requestId: request.id,
      ip: request.ip,
    };

    const ingest = LeadIngestSchema.parse({
      source: 'WEB_FORM',
      channel: 'WEB_FORM',
      contact: { name: body.name, email: body.email, phone: body.phone },
      title: body.title,
      message: body.message ? { body: body.message } : undefined,
      meta: body.meta,
    });

    const lead = await leads.ingest(ctx, ingest);

    if (ingest.message) {
      await messages.recordInbound(ctx, {
        contactId: lead.contactId,
        channel: 'WEB_FORM',
        body: ingest.message.body,
        leadId: lead.id,
      });
    }

    return reply.status(201).send({ leadId: lead.id, contactId: lead.contactId });
  });
}

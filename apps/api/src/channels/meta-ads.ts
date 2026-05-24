// Meta Lead Ads inbound adapter.
//
// Meta posts a notification containing a leadgen_id; the actual lead form
// data must be fetched separately from the Graph API using a page access
// token. In Phase 1 we accept the notification, persist a Lead carrying the
// leadgen_id in sourceMeta, and defer the Graph fetch + form-field mapping
// to a background worker (Phase 1, Chunk 4).
//
// Webhook URL: https://api.example.com/webhooks/meta-ads?token=<credential.webhookToken>

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MetaAdsConfigSchema } from '@roofops/types';
import { Errors } from '../errors.js';
import { verifyMetaSignature } from '../lib/webhook-verify.js';
import { authContextFromCredential } from './_lib.js';
import { ContactsService } from '../services/contacts.js';
import { LeadsService } from '../services/leads.js';
import { AuditLogger } from '../services/audit.js';

const QuerySchema = z.object({ token: z.string().min(1).max(256) });

const LeadgenChangeSchema = z.object({
  field: z.literal('leadgen'),
  value: z.object({
    leadgen_id: z.string(),
    page_id: z.string(),
    form_id: z.string(),
    created_time: z.number(),
    ad_id: z.string().optional(),
    adgroup_id: z.string().optional(),
  }),
});

const MetaAdsPayloadSchema = z.object({
  object: z.literal('page'),
  entry: z.array(
    z.object({
      id: z.string(),
      time: z.number(),
      changes: z.array(LeadgenChangeSchema),
    }),
  ),
});

export async function metaAdsChannel(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const contacts = new ContactsService(app.prisma, audit);
  const leads = new LeadsService(app.prisma, audit, contacts);

  app.get('/webhooks/meta-ads', async (request, reply) => {
    const { token } = QuerySchema.parse(request.query);
    const credential = await app.channelCredentials.findByToken(token);
    if (!credential || credential.channel !== 'WEB_FORM') {
      // Meta Lead Ads credentials are stored under the WEB_FORM channel for
      // now; revisit if we add a dedicated channel for ads.
      throw Errors.unauthorized('Invalid token');
    }
    const config = MetaAdsConfigSchema.parse(credential.config);

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

  app.post('/webhooks/meta-ads', async (request: FastifyRequest, reply) => {
    const { token } = QuerySchema.parse(request.query);
    const credential = await app.channelCredentials.findByToken(token);
    if (!credential || credential.disabledAt) {
      throw Errors.unauthorized('Invalid or disabled webhook token');
    }
    const config = MetaAdsConfigSchema.parse(credential.config);

    const valid = verifyMetaSignature({
      appSecret: config.appSecret,
      rawBody: request.rawBody ?? '',
      signatureHeader: request.headers['x-hub-signature-256'] as string | undefined,
    });
    if (!valid) {
      request.log.warn({ channel: 'META_ADS' }, 'Meta signature rejected');
      throw Errors.unauthorized('Signature verification failed');
    }

    const payload = MetaAdsPayloadSchema.parse(request.body);
    const ctx = authContextFromCredential(credential, request);

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const { leadgen_id, ad_id, form_id, page_id } = change.value;

        // Placeholder: we don't yet have the contact's name/email/phone
        // until we fetch from /v17.0/<leadgen_id>?access_token=<page>.
        // Stub a contact with leadgen_id as identifier so the audit trail
        // exists; the background worker enriches it once it lands.
        const { contact } = await contacts.findOrCreate(ctx, {
          name: `Meta lead ${leadgen_id}`,
        });

        await leads.ingest(ctx, {
          source: 'META_ADS',
          contact: { name: contact.name },
          title: `Meta Lead Ads form ${form_id}`,
          meta: { leadgenId: leadgen_id, formId: form_id, pageId: page_id, adId: ad_id },
        });
      }
    }

    return reply.status(200).send({ received: true });
  });
}

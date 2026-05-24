// WhatsApp Cloud API outbound transport.
//
// Within the 24-hour customer-service window we can send freeform text.
// Outside that window WhatsApp requires a pre-approved HSM template. This
// transport sends freeform text only; template support lands when proposal
// notifications need it (Phase 3).

import type { PrismaClient } from '@roofops/db';
import { WhatsAppConfigSchema } from '@roofops/types';
import type { MessageTransport } from '../services/messages.js';
import { Errors } from '../errors.js';

export function createWhatsAppTransport(prisma: PrismaClient): MessageTransport {
  return {
    channel: 'WHATSAPP',
    async send({ orgId, contactId, body }) {
      const credentials = await prisma.channelCredential.findFirst({
        where: { orgId, channel: 'WHATSAPP', disabledAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!credentials) {
        throw Errors.conflict('No WhatsApp credential configured for this org');
      }
      const config = WhatsAppConfigSchema.parse(credentials.config);

      const contact = await prisma.contact.findFirst({
        where: { id: contactId, orgId, deletedAt: null },
      });
      if (!contact?.phoneNorm) {
        throw Errors.conflict('Contact has no phone number');
      }
      // WhatsApp expects digits-only (no leading +).
      const to = contact.phoneNorm.replace(/^\+/, '');

      const res = await fetch(`https://graph.facebook.com/v20.0/${config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { preview_url: false, body },
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`WhatsApp send failed (${res.status}): ${errorBody}`);
      }
      const json: unknown = await res.json();
      const id = (json as { messages?: Array<{ id?: string }> }).messages?.[0]?.id ?? null;
      return { externalId: id };
    },
  };
}

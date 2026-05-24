import type { PrismaClient } from '@roofops/db';
import { PostmarkConfigSchema } from '@roofops/types';
import type { MessageTransport } from '../services/messages.js';
import { Errors } from '../errors.js';

export function createPostmarkTransport(prisma: PrismaClient): MessageTransport {
  return {
    channel: 'EMAIL',
    async send({ orgId, contactId, body }) {
      const credentials = await prisma.channelCredential.findFirst({
        where: { orgId, channel: 'EMAIL', disabledAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!credentials) {
        throw Errors.conflict('No Postmark credential configured for this org');
      }
      const config = PostmarkConfigSchema.parse(credentials.config);

      const contact = await prisma.contact.findFirst({
        where: { id: contactId, orgId, deletedAt: null },
      });
      if (!contact?.email) {
        throw Errors.conflict('Contact has no email address');
      }

      const subject =
        body.split('\n').find((line) => line.trim().length > 0)?.slice(0, 120) ?? 'Message from RoofOps';

      const res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': config.serverToken,
        },
        body: JSON.stringify({
          From: config.fromAddress,
          To: contact.email,
          Subject: subject,
          TextBody: body,
          MessageStream: 'outbound',
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Postmark send failed (${res.status}): ${errorBody}`);
      }
      const json: unknown = await res.json();
      const id = (json as { MessageID?: string }).MessageID ?? null;
      return { externalId: id };
    },
  };
}

import type { PrismaClient } from '@roofops/db';
import { TwilioConfigSchema } from '@roofops/types';
import type { MessageTransport } from '../services/messages.js';
import { Errors } from '../errors.js';

export function createTwilioSmsTransport(prisma: PrismaClient): MessageTransport {
  return {
    channel: 'SMS',
    async send({ orgId, contactId, body }) {
      const credentials = await prisma.channelCredential.findFirst({
        where: { orgId, channel: 'SMS', disabledAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!credentials) {
        throw Errors.conflict('No Twilio credential configured for this org');
      }
      const config = TwilioConfigSchema.parse(credentials.config);

      const contact = await prisma.contact.findFirst({
        where: { id: contactId, orgId, deletedAt: null },
      });
      if (!contact?.phoneNorm) {
        throw Errors.conflict('Contact has no phone number');
      }

      const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
      const form = new URLSearchParams({
        From: config.fromNumber,
        To: contact.phoneNorm,
        Body: body,
      });

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        },
      );

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Twilio send failed (${res.status}): ${errorBody}`);
      }
      const json: unknown = await res.json();
      const sid = (json as { sid?: string }).sid ?? null;
      return { externalId: sid };
    },
  };
}

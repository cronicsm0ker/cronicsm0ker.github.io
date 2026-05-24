import type { PrismaClient } from '@roofops/db';
import { TelegramConfigSchema } from '@roofops/types';
import type { MessageTransport } from '../services/messages.js';
import { Errors } from '../errors.js';

export function createTelegramTransport(prisma: PrismaClient): MessageTransport {
  return {
    channel: 'TELEGRAM',
    async send({ orgId, contactId, threadExternalId, body }) {
      const credentials = await prisma.channelCredential.findFirst({
        where: { orgId, channel: 'TELEGRAM', disabledAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!credentials) {
        throw Errors.conflict('No Telegram credential configured for this org');
      }
      const config = TelegramConfigSchema.parse(credentials.config);

      // threadExternalId is the Telegram chat id we stored on inbound.
      if (!threadExternalId) {
        throw Errors.conflict(
          'Telegram requires an inbound message first so we can resolve the chat id',
        );
      }
      // contactId is referenced via the thread; the chat id is what Telegram needs.
      void contactId;

      const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: threadExternalId,
          text: body,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Telegram send failed (${res.status}): ${errorBody}`);
      }
      const json = (await res.json()) as { result?: { message_id?: number } };
      const id = json.result?.message_id ? String(json.result.message_id) : null;
      return { externalId: id };
    },
  };
}

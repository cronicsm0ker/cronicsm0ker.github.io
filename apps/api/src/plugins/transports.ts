import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createTwilioSmsTransport } from '../transports/twilio-sms.js';
import { createWhatsAppTransport } from '../transports/whatsapp.js';
import { createPostmarkTransport } from '../transports/postmark-email.js';
import { createTelegramTransport } from '../transports/telegram.js';

// Registers outbound transports on the MessagesService. Runs after
// inboxRoutes so app.messages is decorated; each transport looks up its
// own ChannelCredential at send time so per-org auth tokens stay scoped.
export const transportsPlugin = fp(async function transportsPlugin(app: FastifyInstance) {
  if (!app.messages) {
    app.log.warn('MessagesService not decorated yet; transports plugin needs to run after inboxRoutes');
    return;
  }
  app.messages.registerTransport(createTwilioSmsTransport(app.prisma));
  app.messages.registerTransport(createWhatsAppTransport(app.prisma));
  app.messages.registerTransport(createPostmarkTransport(app.prisma));
  app.messages.registerTransport(createTelegramTransport(app.prisma));
  app.log.info('Outbound transports registered: SMS, WHATSAPP, EMAIL, TELEGRAM');
});

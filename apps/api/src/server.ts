import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from './env.js';
import { logger } from './logger.js';
import { buildErrorHandler } from './errors.js';
import { rawBodyPlugin } from './plugins/raw-body.js';
import { prismaPlugin } from './plugins/prisma.js';
import { sentryPlugin } from './plugins/sentry.js';
import { otelPlugin } from './plugins/otel.js';
import { authPlugin } from './plugins/auth.js';
import { transportsPlugin } from './plugins/transports.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { contactsRoutes } from './routes/contacts.js';
import { leadsRoutes } from './routes/leads.js';
import { inboxRoutes } from './routes/inbox.js';
import { channelCredentialsRoutes } from './routes/channel-credentials.js';
import { webFormChannel } from './channels/web-form.js';
import { twilioSmsChannel } from './channels/twilio-sms.js';
import { whatsappChannel } from './channels/whatsapp.js';
import { metaAdsChannel } from './channels/meta-ads.js';
import { postmarkChannel } from './channels/postmark-email.js';
import { telegramChannel } from './channels/telegram.js';

export async function buildApp() {
  const env = loadEnv();

  const app = Fastify({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
    trustProxy: true,
    disableRequestLogging: false,
  });

  app.setErrorHandler(buildErrorHandler());

  // Content parsers must register before any plugin that uses them, so the
  // raw-body capture is in effect for the webhook routes registered below.
  await app.register(rawBodyPlugin);
  await app.register(formbody);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    credentials: true,
  });
  await app.register(sensible);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(sentryPlugin);
  await app.register(otelPlugin);
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(contactsRoutes);
  await app.register(leadsRoutes);
  await app.register(inboxRoutes);
  await app.register(channelCredentialsRoutes);

  // Outbound transports register onto MessagesService; must come after
  // inboxRoutes so app.messages is decorated.
  await app.register(transportsPlugin);

  // Inbound channel adapters. Must register after channelCredentialsRoutes
  // so the channelCredentials decorator is available.
  await app.register(webFormChannel);
  await app.register(twilioSmsChannel);
  await app.register(whatsappChannel);
  await app.register(metaAdsChannel);
  await app.register(postmarkChannel);
  await app.register(telegramChannel);

  return app;
}

async function main() {
  const env = loadEnv();
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;
if (isEntryPoint) {
  void main();
}

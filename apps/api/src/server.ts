import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from './env.js';
import { logger } from './logger.js';
import { buildErrorHandler } from './errors.js';
import { prismaPlugin } from './plugins/prisma.js';
import { sentryPlugin } from './plugins/sentry.js';
import { otelPlugin } from './plugins/otel.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';

export async function buildApp() {
  const env = loadEnv();

  const app = Fastify({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
    trustProxy: true,
    disableRequestLogging: false,
  });

  app.setErrorHandler(buildErrorHandler());

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

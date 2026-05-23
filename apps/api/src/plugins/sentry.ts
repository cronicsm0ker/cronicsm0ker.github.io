import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import * as Sentry from '@sentry/node';
import { loadEnv } from '../env.js';

let initialized = false;

export const sentryPlugin = fp(async function sentryPlugin(app: FastifyInstance) {
  const env = loadEnv();
  if (!env.SENTRY_DSN || env.SENTRY_DSN.length === 0) {
    app.log.info('Sentry DSN not configured; Sentry disabled');
    return;
  }
  if (!initialized) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
    initialized = true;
  }

  app.addHook('onRequest', async (request) => {
    Sentry.getCurrentScope().setTag('request_id', request.id);
  });
});

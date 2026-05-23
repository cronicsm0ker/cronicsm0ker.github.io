import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../env.js';

// Phase 0: stub. We initialize an OTel-compatible logging surface that
// emits spans to stdout in dev. Phase 1 swaps in @opentelemetry/sdk-node
// with the OTLP exporter pointed at the production collector.
export const otelPlugin = fp(async function otelPlugin(app: FastifyInstance) {
  const env = loadEnv();
  app.log.info({ service: env.OTEL_SERVICE_NAME }, 'OTel SDK initialized (console exporter)');
});

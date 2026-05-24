import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

// Overrides the default JSON content-type parser to keep the original
// payload available on `request.rawBody`. Required so Meta / WhatsApp
// webhook routes can HMAC over the exact bytes the provider signed.
export const rawBodyPlugin = fp(async function rawBodyPlugin(app: FastifyInstance) {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    function jsonParser(req, body, done) {
      req.rawBody = body as string;
      if ((body as string).length === 0) {
        done(null, undefined);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(body as string);
        done(null, parsed);
      } catch (err) {
        done(err as Error);
      }
    },
  );
});

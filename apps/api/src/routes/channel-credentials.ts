import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateChannelCredentialSchema,
  UpdateChannelCredentialSchema,
} from '@roofops/types';
import { authContextFrom } from '../lib/auth-context.js';
import { ChannelCredentialsService } from '../services/channel-credentials.js';
import { AuditLogger } from '../services/audit.js';

const IdParamSchema = z.object({ id: z.string().uuid() });

export async function channelCredentialsRoutes(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const service = new ChannelCredentialsService(app.prisma, audit);

  // Expose for inbound adapters (registered later in server boot).
  app.decorate('channelCredentials', service);

  app.get('/channel-credentials', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    return { items: await service.list(ctx) };
  });

  app.post(
    '/channel-credentials',
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const ctx = authContextFrom(request);
      const body = CreateChannelCredentialSchema.parse(request.body);
      const result = await service.create(ctx, body);
      return reply.status(201).send(result);
    },
  );

  app.patch(
    '/channel-credentials/:id',
    { preHandler: [app.requireAuth] },
    async (request) => {
      const ctx = authContextFrom(request);
      const { id } = IdParamSchema.parse(request.params);
      const body = UpdateChannelCredentialSchema.parse(request.body);
      return service.update(ctx, id, body);
    },
  );

  app.post(
    '/channel-credentials/:id/rotate-token',
    { preHandler: [app.requireAuth] },
    async (request) => {
      const ctx = authContextFrom(request);
      const { id } = IdParamSchema.parse(request.params);
      return service.rotateWebhookToken(ctx, id);
    },
  );

  app.delete(
    '/channel-credentials/:id',
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const ctx = authContextFrom(request);
      const { id } = IdParamSchema.parse(request.params);
      await service.delete(ctx, id);
      return reply.status(204).send();
    },
  );
}

declare module 'fastify' {
  interface FastifyInstance {
    channelCredentials: ChannelCredentialsService;
  }
}

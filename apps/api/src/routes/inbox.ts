import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SendMessageRequestSchema } from '@roofops/types';
import { authContextFrom } from '../lib/auth-context.js';
import { MessagesService } from '../services/messages.js';
import { AuditLogger } from '../services/audit.js';

const ThreadParamSchema = z.object({ threadId: z.string().uuid() });
const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});

export async function inboxRoutes(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const messages = new MessagesService(app.prisma, audit);

  // Expose the messages service so channel-adapter modules can register
  // transports against it at boot.
  app.decorate('messages', messages);

  app.get('/threads', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const query = ListQuerySchema.parse(request.query);
    return messages.listThreads(ctx, query);
  });

  app.get('/threads/:threadId/messages', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { threadId } = ThreadParamSchema.parse(request.params);
    const query = ListQuerySchema.parse(request.query);
    return messages.listMessages(ctx, threadId, query);
  });

  app.post('/messages', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const ctx = authContextFrom(request);
    const body = SendMessageRequestSchema.parse(request.body);
    const created = await messages.send(ctx, body);
    return reply.status(201).send(created);
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    messages: MessagesService;
  }
}

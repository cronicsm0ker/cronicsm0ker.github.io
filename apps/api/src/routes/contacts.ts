import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ContactInputSchema, ContactPatchSchema, ContactMergeRequestSchema } from '@roofops/types';
import { authContextFrom } from '../lib/auth-context.js';
import { ContactsService } from '../services/contacts.js';
import { AuditLogger } from '../services/audit.js';

const ListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const IdParamSchema = z.object({ id: z.string().uuid() });

export async function contactsRoutes(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const service = new ContactsService(app.prisma, audit);

  app.get('/contacts', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const query = ListQuerySchema.parse(request.query);
    return { items: await service.list(ctx, query) };
  });

  app.get('/contacts/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    return service.findById(ctx, id);
  });

  app.post('/contacts', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const ctx = authContextFrom(request);
    const body = ContactInputSchema.parse(request.body);
    const result = await service.findOrCreate(ctx, body);
    return reply.status(result.created ? 201 : 200).send(result.contact);
  });

  app.patch('/contacts/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    const patch = ContactPatchSchema.parse(request.body);
    return service.update(ctx, id, patch);
  });

  app.post('/contacts/merge', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const body = ContactMergeRequestSchema.parse(request.body);
    return service.merge(ctx, body);
  });
}

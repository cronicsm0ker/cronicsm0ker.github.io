import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PriceBookItemInputSchema,
  PriceBookItemPatchSchema,
  PriceBookKindSchema,
} from '@roofops/types';
import { authContextFrom } from '../lib/auth-context.js';
import { PriceBookService } from '../services/price-book.js';
import { AuditLogger } from '../services/audit.js';

const ListQuerySchema = z.object({
  kind: PriceBookKindSchema.optional(),
  includeArchived: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  search: z.string().max(200).optional(),
});

const IdParamSchema = z.object({ id: z.string().uuid() });

const ImportBodySchema = z.object({
  rows: z.array(z.record(z.unknown())).max(5000),
});

export async function priceBookRoutes(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const service = new PriceBookService(app.prisma, audit);

  app.get('/price-book', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const query = ListQuerySchema.parse(request.query);
    return { items: await service.list(ctx, query) };
  });

  app.post('/price-book', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const ctx = authContextFrom(request);
    const body = PriceBookItemInputSchema.parse(request.body);
    const created = await service.create(ctx, body);
    return reply.status(201).send(created);
  });

  app.patch('/price-book/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    const patch = PriceBookItemPatchSchema.parse(request.body);
    return service.update(ctx, id, patch);
  });

  app.delete('/price-book/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    await service.delete(ctx, id);
    return reply.status(204).send();
  });

  app.post(
    '/price-book/import',
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const ctx = authContextFrom(request);
      const body = ImportBodySchema.parse(request.body);
      const result = await service.importRows(ctx, body.rows);
      return reply.status(200).send(result);
    },
  );
}

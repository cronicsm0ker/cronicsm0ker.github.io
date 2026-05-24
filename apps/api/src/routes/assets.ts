import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AssetOwnerTypeSchema,
  FinalizeUploadSchema,
  RequestUploadSchema,
} from '@roofops/types';
import { authContextFrom } from '../lib/auth-context.js';
import { AssetsService } from '../services/assets.js';
import { AuditLogger } from '../services/audit.js';
import { loadEnv } from '../env.js';
import { createAssetStorage } from '../lib/s3.js';

const IdParamSchema = z.object({ id: z.string().uuid() });
const ListQuerySchema = z.object({
  ownerType: AssetOwnerTypeSchema,
  ownerId: z.string().uuid(),
});

export async function assetsRoutes(app: FastifyInstance) {
  const env = loadEnv();
  const audit = new AuditLogger(app.prisma);
  const storage = createAssetStorage(env);
  const service = new AssetsService(app.prisma, audit, storage);

  // Decorate so the AI proposal generator (Chunk E) can read blueprint
  // bytes without re-instantiating the storage client.
  app.decorate('assets', service);

  if (!service.isConfigured()) {
    app.log.warn(
      'Asset storage not configured (S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY); /assets endpoints will 409',
    );
  }

  app.post('/assets/upload-ticket', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const ctx = authContextFrom(request);
    const body = RequestUploadSchema.parse(request.body);
    const ticket = await service.requestUpload(ctx, body);
    return reply.status(201).send(ticket);
  });

  app.post('/assets/:id/finalize', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    const body = FinalizeUploadSchema.parse(request.body);
    return service.finalize(ctx, id, body.contentHash);
  });

  app.get('/assets/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    return service.getWithDownloadUrl(ctx, id);
  });

  app.get('/assets', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const query = ListQuerySchema.parse(request.query);
    return { items: await service.listForOwner(ctx, query.ownerType, query.ownerId) };
  });

  app.delete('/assets/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    await service.delete(ctx, id);
    return reply.status(204).send();
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    assets: AssetsService;
  }
}

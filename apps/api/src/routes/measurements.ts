import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateManualPolygonMeasurementSchema,
  CreateMeasurementSchema,
} from '@roofops/types';
import { authContextFrom } from '../lib/auth-context.js';
import { MeasurementsService } from '../services/measurements.js';
import { AuditLogger } from '../services/audit.js';

const LeadParamSchema = z.object({ leadId: z.string().uuid() });
const IdParamSchema = z.object({ id: z.string().uuid() });

export async function measurementsRoutes(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const service = new MeasurementsService(app.prisma, audit);

  app.get(
    '/leads/:leadId/measurements',
    { preHandler: [app.requireAuth] },
    async (request) => {
      const ctx = authContextFrom(request);
      const { leadId } = LeadParamSchema.parse(request.params);
      return { items: await service.list(ctx, leadId) };
    },
  );

  app.post(
    '/measurements',
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const ctx = authContextFrom(request);
      const body = CreateMeasurementSchema.parse(request.body);
      const created = await service.createManual(ctx, body);
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/measurements/polygon',
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const ctx = authContextFrom(request);
      const body = CreateManualPolygonMeasurementSchema.parse(request.body);
      const created = await service.createFromPolygon(ctx, body);
      return reply.status(201).send(created);
    },
  );

  app.delete(
    '/measurements/:id',
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const ctx = authContextFrom(request);
      const { id } = IdParamSchema.parse(request.params);
      await service.delete(ctx, id);
      return reply.status(204).send();
    },
  );
}

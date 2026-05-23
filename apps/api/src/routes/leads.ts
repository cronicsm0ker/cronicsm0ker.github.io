import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AssignLeadRequestSchema,
  ChangeLeadStageRequestSchema,
  CreateLeadRequestSchema,
  LeadListQuerySchema,
  UpdateLeadRequestSchema,
} from '@roofops/types';
import { authContextFrom } from '../lib/auth-context.js';
import { LeadsService } from '../services/leads.js';
import { ContactsService } from '../services/contacts.js';
import { ActivitiesService } from '../services/activities.js';
import { AuditLogger } from '../services/audit.js';

const IdParamSchema = z.object({ id: z.string().uuid() });
const ActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});

export async function leadsRoutes(app: FastifyInstance) {
  const audit = new AuditLogger(app.prisma);
  const contacts = new ContactsService(app.prisma, audit);
  const leads = new LeadsService(app.prisma, audit, contacts);
  const activities = new ActivitiesService(app.prisma);

  app.get('/leads', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const query = LeadListQuerySchema.parse(request.query);
    return leads.list(ctx, query);
  });

  app.post('/leads', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const ctx = authContextFrom(request);
    const body = CreateLeadRequestSchema.parse(request.body);
    const created = await leads.create(ctx, body);
    return reply.status(201).send(created);
  });

  app.get('/leads/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    return leads.findById(ctx, id);
  });

  app.patch('/leads/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    const patch = UpdateLeadRequestSchema.parse(request.body);
    return leads.update(ctx, id, patch);
  });

  app.post('/leads/:id/assign', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    const body = AssignLeadRequestSchema.parse(request.body);
    return leads.assign(ctx, id, body);
  });

  app.post('/leads/:id/stage', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    const body = ChangeLeadStageRequestSchema.parse(request.body);
    return leads.changeStage(ctx, id, body);
  });

  app.get('/leads/:id/activities', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    const query = ActivityQuerySchema.parse(request.query);
    return activities.listForLead(ctx, id, query);
  });
}

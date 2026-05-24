import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AcceptProposalSchema,
  CreateProposalRequestSchema,
  GenerateProposalRequestSchema,
  SendProposalRequestSchema,
  UpdateProposalDraftSchema,
} from '@roofops/types';
import { authContextFrom } from '../lib/auth-context.js';
import { ProposalsService } from '../services/proposals.js';
import { AuditLogger } from '../services/audit.js';
import { loadEnv } from '../env.js';

const IdParamSchema = z.object({ id: z.string().uuid() });
const TokenParamSchema = z.object({ token: z.string().min(1).max(256) });

export async function proposalsRoutes(app: FastifyInstance) {
  const env = loadEnv();
  const audit = new AuditLogger(app.prisma);
  const service = new ProposalsService(app.prisma, audit, env);

  app.decorate('proposals', service);

  app.get('/proposals/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const ctx = authContextFrom(request);
    const { id } = IdParamSchema.parse(request.params);
    return service.findById(ctx, id);
  });

  app.get(
    '/leads/:leadId/proposals',
    { preHandler: [app.requireAuth] },
    async (request) => {
      const ctx = authContextFrom(request);
      const { leadId } = z.object({ leadId: z.string().uuid() }).parse(request.params);
      return { items: await service.listForLead(ctx, leadId) };
    },
  );

  app.post('/proposals', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const ctx = authContextFrom(request);
    const body = CreateProposalRequestSchema.parse(request.body);
    const created = await service.create(ctx, body);
    return reply.status(201).send(created);
  });

  app.post(
    '/proposals/generate',
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const ctx = authContextFrom(request);
      const body = GenerateProposalRequestSchema.parse(request.body);
      const result = await service.generate(ctx, body);
      return reply.status(201).send(result);
    },
  );

  app.patch(
    '/proposals/:id',
    { preHandler: [app.requireAuth] },
    async (request) => {
      const ctx = authContextFrom(request);
      const { id } = IdParamSchema.parse(request.params);
      const patch = UpdateProposalDraftSchema.parse(request.body);
      return service.updateDraft(ctx, id, patch);
    },
  );

  app.post(
    '/proposals/:id/send',
    { preHandler: [app.requireAuth] },
    async (request) => {
      const ctx = authContextFrom(request);
      const { id } = IdParamSchema.parse(request.params);
      // Body kept for future use (channel selection, custom message); ignored for Phase 2.
      SendProposalRequestSchema.parse(request.body ?? {});
      return service.markSent(ctx, id);
    },
  );

  app.post(
    '/proposals/:id/withdraw',
    { preHandler: [app.requireAuth] },
    async (request) => {
      const ctx = authContextFrom(request);
      const { id } = IdParamSchema.parse(request.params);
      return service.withdraw(ctx, id);
    },
  );

  app.post(
    '/proposals/:id/rotate-token',
    { preHandler: [app.requireAuth] },
    async (request) => {
      const ctx = authContextFrom(request);
      const { id } = IdParamSchema.parse(request.params);
      return service.generatePublicTokenForExistingProposal(ctx, id);
    },
  );

  // ---- Public customer portal (no auth, signed link) ----

  app.get('/portal/proposals/:token', async (request) => {
    const { token } = TokenParamSchema.parse(request.params);
    return service.readByPublicToken(token);
  });

  app.post('/portal/proposals/:token/accept', async (request) => {
    const { token } = TokenParamSchema.parse(request.params);
    const body = AcceptProposalSchema.parse(request.body);
    return service.acceptByPublicToken(token, body);
  });

  app.post('/portal/proposals/:token/reject', async (request) => {
    const { token } = TokenParamSchema.parse(request.params);
    const body = z
      .object({ rejectionReason: z.string().max(2000) })
      .parse(request.body);
    return service.rejectByPublicToken(token, body.rejectionReason);
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    proposals: ProposalsService;
  }
}

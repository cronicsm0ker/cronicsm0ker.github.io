import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
} from '@roofops/types';
import { AuthService } from '../services/auth.js';
import { createConsoleEmailProvider } from '../services/email.js';
import { loadEnv } from '../env.js';

const LogoutRequestSchema = z.object({
  refreshToken: z.string().optional().nullable(),
});

export async function authRoutes(app: FastifyInstance) {
  const env = loadEnv();
  const email = createConsoleEmailProvider(app.log as never);
  const service = new AuthService({
    prisma: app.prisma,
    env,
    signAccessToken: app.signAccessToken,
    email,
    logger: app.log as never,
  });

  app.post('/auth/register', async (request, reply) => {
    const body = RegisterRequestSchema.parse(request.body);
    const result = await service.register(body);
    return reply.status(201).send(result);
  });

  app.post('/auth/login', async (request) => {
    const body = LoginRequestSchema.parse(request.body);
    return service.login(body);
  });

  app.post('/auth/refresh', async (request) => {
    const body = RefreshRequestSchema.parse(request.body);
    const tokens = await service.refresh(body.refreshToken);
    return { tokens };
  });

  app.post('/auth/logout', async (request, reply) => {
    const body = LogoutRequestSchema.parse(request.body ?? {});
    await service.logout(body.refreshToken ?? undefined);
    return reply.status(204).send();
  });

  app.post('/auth/forgot', async (request, reply) => {
    const body = ForgotPasswordRequestSchema.parse(request.body);
    await service.forgotPassword(body.email);
    return reply.status(204).send();
  });

  app.post('/auth/reset', async (request, reply) => {
    const body = ResetPasswordRequestSchema.parse(request.body);
    await service.resetPassword(body);
    return reply.status(204).send();
  });
}

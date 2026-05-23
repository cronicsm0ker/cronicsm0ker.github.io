import type { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth.js';
import { createConsoleEmailProvider } from '../services/email.js';
import { loadEnv } from '../env.js';

export async function meRoutes(app: FastifyInstance) {
  const env = loadEnv();
  const email = createConsoleEmailProvider(app.log as never);
  const service = new AuthService({
    prisma: app.prisma,
    env,
    signAccessToken: app.signAccessToken,
    email,
    logger: app.log as never,
  });

  app.get(
    '/me',
    { preHandler: [app.requireAuth] },
    async (request) => {
      return service.me(request.auth.sub);
    },
  );
}

import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'roofops-api',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/ready', async () => {
    await app.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  });
}

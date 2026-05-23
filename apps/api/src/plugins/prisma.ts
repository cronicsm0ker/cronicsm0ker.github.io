import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createPrismaClient, type PrismaClient } from '@roofops/db';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async function prismaPlugin(app: FastifyInstance) {
  const prisma = createPrismaClient({ log: ['warn', 'error'] });
  await prisma.$connect();
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});

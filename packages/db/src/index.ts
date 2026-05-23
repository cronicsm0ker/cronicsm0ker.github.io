import { PrismaClient } from '@prisma/client';

export type { Prisma } from '@prisma/client';
export { PrismaClient, Role } from '@prisma/client';
export type {
  User,
  Org,
  Membership,
  RefreshToken,
  PasswordResetToken,
  Contact,
} from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __roofopsPrisma: PrismaClient | undefined;
}

export function createPrismaClient(options?: ConstructorParameters<typeof PrismaClient>[0]): PrismaClient {
  return new PrismaClient(options);
}

export function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return createPrismaClient();
  }
  if (!globalThis.__roofopsPrisma) {
    globalThis.__roofopsPrisma = createPrismaClient({ log: ['warn', 'error'] });
  }
  return globalThis.__roofopsPrisma;
}

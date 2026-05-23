import type { PrismaClient } from '@roofops/db';
import type { AuthContext } from '../lib/auth-context.js';

export interface AuditWrite {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export class AuditLogger {
  constructor(private readonly prisma: PrismaClient) {}

  async log(ctx: AuthContext, entry: AuditWrite): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: (entry.before ?? null) as never,
        after: (entry.after ?? null) as never,
        requestId: ctx.requestId,
        ip: ctx.ip,
      },
    });
  }
}

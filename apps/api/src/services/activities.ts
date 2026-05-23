import type { PrismaClient } from '@roofops/db';
import type { Activity, ActivityListResponse } from '@roofops/types';
import type { AuthContext } from '../lib/auth-context.js';

interface ActivityRow {
  id: string;
  orgId: string;
  kind: Activity['kind'];
  contactId: string | null;
  leadId: string | null;
  threadId: string | null;
  messageId: string | null;
  actorId: string | null;
  payload: unknown;
  createdAt: Date;
}

function toDto(row: ActivityRow): Activity {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind,
    contactId: row.contactId,
    leadId: row.leadId,
    threadId: row.threadId,
    messageId: row.messageId,
    actorId: row.actorId,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class ActivitiesService {
  constructor(private readonly prisma: PrismaClient) {}

  async listForLead(
    ctx: AuthContext,
    leadId: string,
    opts: { limit: number; cursor?: string },
  ): Promise<ActivityListResponse> {
    const rows = await this.prisma.activity.findMany({
      where: { orgId: ctx.orgId, leadId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
    const hasMore = rows.length > opts.limit;
    const slice = hasMore ? rows.slice(0, opts.limit) : rows;
    return {
      items: slice.map(toDto),
      nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
    };
  }

  async listForContact(
    ctx: AuthContext,
    contactId: string,
    opts: { limit: number; cursor?: string },
  ): Promise<ActivityListResponse> {
    const rows = await this.prisma.activity.findMany({
      where: { orgId: ctx.orgId, contactId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
    const hasMore = rows.length > opts.limit;
    const slice = hasMore ? rows.slice(0, opts.limit) : rows;
    return {
      items: slice.map(toDto),
      nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
    };
  }
}

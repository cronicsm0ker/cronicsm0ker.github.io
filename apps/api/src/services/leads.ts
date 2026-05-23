import type { PrismaClient } from '@roofops/db';
import type {
  AssignLeadRequest,
  ChangeLeadStageRequest,
  CreateLeadRequest,
  Lead as LeadDto,
  LeadIngest,
  LeadListQuery,
  LeadListResponse,
  LeadStage,
  LeadWithContact,
  UpdateLeadRequest,
} from '@roofops/types';
import { LEAD_STAGE_TRANSITIONS } from '@roofops/types';
import type { AuthContext } from '../lib/auth-context.js';
import { Errors } from '../errors.js';
import { AuditLogger } from './audit.js';
import { ContactsService } from './contacts.js';

interface LeadRow {
  id: string;
  orgId: string;
  contactId: string;
  ownerId: string | null;
  stage: LeadStage;
  source: LeadDto['source'];
  sourceMeta: unknown;
  title: string | null;
  notes: string | null;
  firstRespondedAt: Date | null;
  slaBreachedAt: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  lostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: LeadRow): LeadDto {
  return {
    id: row.id,
    orgId: row.orgId,
    contactId: row.contactId,
    ownerId: row.ownerId,
    stage: row.stage,
    source: row.source,
    sourceMeta: (row.sourceMeta as Record<string, unknown> | null) ?? null,
    title: row.title,
    notes: row.notes,
    firstRespondedAt: row.firstRespondedAt ? row.firstRespondedAt.toISOString() : null,
    slaBreachedAt: row.slaBreachedAt ? row.slaBreachedAt.toISOString() : null,
    wonAt: row.wonAt ? row.wonAt.toISOString() : null,
    lostAt: row.lostAt ? row.lostAt.toISOString() : null,
    lostReason: row.lostReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class LeadsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditLogger,
    private readonly contacts: ContactsService,
  ) {}

  async create(ctx: AuthContext, req: CreateLeadRequest): Promise<LeadWithContact> {
    const { contact } = await this.contacts.findOrCreate(ctx, req.contact);

    const created = await this.prisma.lead.create({
      data: {
        orgId: ctx.orgId,
        contactId: contact.id,
        ownerId: req.ownerId ?? null,
        stage: 'NEW',
        source: req.source,
        sourceMeta: (req.sourceMeta ?? null) as never,
        title: req.title ?? null,
        notes: req.notes ?? null,
      },
    });

    await this.prisma.activity.create({
      data: {
        orgId: ctx.orgId,
        kind: 'LEAD_CREATED',
        leadId: created.id,
        contactId: contact.id,
        actorId: ctx.userId,
        payload: { source: req.source },
      },
    });
    await this.audit.log(ctx, {
      action: 'lead.created',
      entityType: 'Lead',
      entityId: created.id,
      after: { contactId: contact.id, source: req.source, ownerId: created.ownerId },
    });
    return { ...toDto(created), contact };
  }

  // Used by channel adapters; bypasses auth-from-request and instead is
  // called with an explicit AuthContext built by the webhook router.
  async ingest(ctx: AuthContext, payload: LeadIngest): Promise<LeadWithContact> {
    const created = await this.create(ctx, {
      contact: payload.contact,
      source: payload.source,
      title: payload.title,
      sourceMeta: payload.meta ?? undefined,
    });
    if (payload.message) {
      // Message creation is handled in the messages service to keep this
      // service focused on lead lifecycle. Channel adapters call both.
    }
    return created;
  }

  async findById(ctx: AuthContext, id: string): Promise<LeadWithContact> {
    const row = await this.prisma.lead.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null },
      include: { contact: true },
    });
    if (!row) throw Errors.notFound('Lead not found');
    return {
      ...toDto(row),
      contact: {
        id: row.contact.id,
        orgId: row.contact.orgId,
        name: row.contact.name,
        email: row.contact.email,
        phone: row.contact.phone,
        notes: row.contact.notes,
        preferredChannel: row.contact.preferredChannel,
        optedOutAt: row.contact.optedOutAt?.toISOString() ?? null,
        createdAt: row.contact.createdAt.toISOString(),
        updatedAt: row.contact.updatedAt.toISOString(),
      },
    };
  }

  async list(ctx: AuthContext, query: LeadListQuery): Promise<LeadListResponse> {
    const where = {
      orgId: ctx.orgId,
      deletedAt: null,
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.search
        ? {
            contact: {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { emailNorm: { contains: query.search.toLowerCase() } },
                { phoneNorm: { contains: query.search.replace(/\D/g, '') } },
              ],
            },
          }
        : {}),
    };

    const rows = await this.prisma.lead.findMany({
      where,
      include: { contact: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    });

    const hasMore = rows.length > query.limit;
    const slice = hasMore ? rows.slice(0, query.limit) : rows;
    const items: LeadWithContact[] = slice.map((row) => ({
      ...toDto(row),
      contact: {
        id: row.contact.id,
        orgId: row.contact.orgId,
        name: row.contact.name,
        email: row.contact.email,
        phone: row.contact.phone,
        notes: row.contact.notes,
        preferredChannel: row.contact.preferredChannel,
        optedOutAt: row.contact.optedOutAt?.toISOString() ?? null,
        createdAt: row.contact.createdAt.toISOString(),
        updatedAt: row.contact.updatedAt.toISOString(),
      },
    }));
    return {
      items,
      nextCursor: hasMore ? (slice[slice.length - 1]?.id ?? null) : null,
    };
  }

  async update(ctx: AuthContext, id: string, patch: UpdateLeadRequest): Promise<LeadDto> {
    const before = await this.prisma.lead.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null },
    });
    if (!before) throw Errors.notFound('Lead not found');
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        title: patch.title ?? before.title,
        notes: patch.notes ?? before.notes,
        ownerId: patch.ownerId === undefined ? before.ownerId : patch.ownerId,
        lostReason: patch.lostReason ?? before.lostReason,
      },
    });
    await this.audit.log(ctx, {
      action: 'lead.updated',
      entityType: 'Lead',
      entityId: id,
      before: { title: before.title, ownerId: before.ownerId },
      after: { title: updated.title, ownerId: updated.ownerId },
    });
    return toDto(updated);
  }

  async assign(ctx: AuthContext, id: string, req: AssignLeadRequest): Promise<LeadDto> {
    const before = await this.prisma.lead.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null },
    });
    if (!before) throw Errors.notFound('Lead not found');

    if (req.ownerId) {
      const membership = await this.prisma.membership.findUnique({
        where: { userId_orgId: { userId: req.ownerId, orgId: ctx.orgId } },
      });
      if (!membership) {
        throw Errors.forbidden('Owner is not a member of this org');
      }
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { ownerId: req.ownerId },
    });
    await this.prisma.activity.create({
      data: {
        orgId: ctx.orgId,
        kind: 'LEAD_ASSIGNED',
        leadId: id,
        contactId: before.contactId,
        actorId: ctx.userId,
        payload: { fromOwnerId: before.ownerId, toOwnerId: req.ownerId },
      },
    });
    await this.audit.log(ctx, {
      action: 'lead.assigned',
      entityType: 'Lead',
      entityId: id,
      before: { ownerId: before.ownerId },
      after: { ownerId: updated.ownerId },
    });
    return toDto(updated);
  }

  async changeStage(ctx: AuthContext, id: string, req: ChangeLeadStageRequest): Promise<LeadDto> {
    const before = await this.prisma.lead.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null },
    });
    if (!before) throw Errors.notFound('Lead not found');

    const allowed = LEAD_STAGE_TRANSITIONS[before.stage as LeadStage];
    if (!allowed.includes(req.stage)) {
      throw Errors.conflict(
        `Invalid stage transition: ${before.stage} → ${req.stage}`,
      );
    }
    if (req.stage === 'LOST' && !req.lostReason) {
      throw Errors.conflict('lostReason is required when moving to LOST');
    }

    const now = new Date();
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        stage: req.stage,
        firstRespondedAt:
          before.firstRespondedAt ?? (req.stage !== 'NEW' ? now : null),
        wonAt: req.stage === 'WON' ? now : before.stage === 'WON' ? before.wonAt : null,
        lostAt: req.stage === 'LOST' ? now : before.stage === 'LOST' ? before.lostAt : null,
        lostReason: req.stage === 'LOST' ? req.lostReason ?? null : before.lostReason,
      },
    });
    await this.prisma.activity.create({
      data: {
        orgId: ctx.orgId,
        kind: 'LEAD_STAGE_CHANGED',
        leadId: id,
        contactId: before.contactId,
        actorId: ctx.userId,
        payload: { from: before.stage, to: req.stage, lostReason: req.lostReason },
      },
    });
    await this.audit.log(ctx, {
      action: 'lead.stage_changed',
      entityType: 'Lead',
      entityId: id,
      before: { stage: before.stage },
      after: { stage: updated.stage },
    });
    return toDto(updated);
  }
}

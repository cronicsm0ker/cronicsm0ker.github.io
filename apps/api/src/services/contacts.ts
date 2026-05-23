import type { PrismaClient } from '@roofops/db';
import type {
  Contact as ContactDto,
  ContactInput,
  ContactPatch,
  ContactMergeRequest,
} from '@roofops/types';
import type { AuthContext } from '../lib/auth-context.js';
import { Errors } from '../errors.js';
import { normalizeEmail, normalizePhone } from '../lib/normalize.js';
import { AuditLogger } from './audit.js';

interface ContactRow {
  id: string;
  orgId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  preferredChannel: ContactDto['preferredChannel'] | null;
  optedOutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: ContactRow): ContactDto {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    preferredChannel: row.preferredChannel ?? null,
    optedOutAt: row.optedOutAt ? row.optedOutAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class ContactsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditLogger,
  ) {}

  async findById(ctx: AuthContext, id: string): Promise<ContactDto> {
    const row = await this.prisma.contact.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null },
    });
    if (!row) throw Errors.notFound('Contact not found');
    return toDto(row);
  }

  async list(ctx: AuthContext, opts: { search?: string; limit: number }): Promise<ContactDto[]> {
    const search = opts.search?.trim();
    const rows = await this.prisma.contact.findMany({
      where: {
        orgId: ctx.orgId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { emailNorm: { contains: search.toLowerCase() } },
                { phoneNorm: { contains: search.replace(/\D/g, '') } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
    });
    return rows.map(toDto);
  }

  // Upsert by (orgId, normalized email or phone). Returns the existing
  // contact when one matches; otherwise creates a new one. Used by manual
  // form entry AND by channel adapters to dedup leads from repeat senders.
  async findOrCreate(ctx: AuthContext, input: ContactInput): Promise<{ contact: ContactDto; created: boolean }> {
    const emailNorm = normalizeEmail(input.email ?? null);
    const phoneNorm = normalizePhone(input.phone ?? null);

    if (emailNorm || phoneNorm) {
      const existing = await this.prisma.contact.findFirst({
        where: {
          orgId: ctx.orgId,
          deletedAt: null,
          OR: [
            ...(emailNorm ? [{ emailNorm }] : []),
            ...(phoneNorm ? [{ phoneNorm }] : []),
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) {
        return { contact: toDto(existing), created: false };
      }
    }

    const created = await this.prisma.contact.create({
      data: {
        orgId: ctx.orgId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        emailNorm,
        phoneNorm,
        notes: input.notes ?? null,
        preferredChannel: input.preferredChannel ?? null,
      },
    });
    await this.audit.log(ctx, {
      action: 'contact.created',
      entityType: 'Contact',
      entityId: created.id,
      after: { name: created.name, email: created.email, phone: created.phone },
    });
    return { contact: toDto(created), created: true };
  }

  async update(ctx: AuthContext, id: string, patch: ContactPatch): Promise<ContactDto> {
    const before = await this.prisma.contact.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null },
    });
    if (!before) throw Errors.notFound('Contact not found');

    const updated = await this.prisma.contact.update({
      where: { id },
      data: {
        name: patch.name ?? before.name,
        email: patch.email ?? before.email,
        phone: patch.phone ?? before.phone,
        emailNorm: patch.email !== undefined ? normalizeEmail(patch.email) : before.emailNorm,
        phoneNorm: patch.phone !== undefined ? normalizePhone(patch.phone) : before.phoneNorm,
        notes: patch.notes ?? before.notes,
        preferredChannel: patch.preferredChannel ?? before.preferredChannel,
      },
    });
    await this.audit.log(ctx, {
      action: 'contact.updated',
      entityType: 'Contact',
      entityId: id,
      before: { name: before.name, email: before.email, phone: before.phone },
      after: { name: updated.name, email: updated.email, phone: updated.phone },
    });
    return toDto(updated);
  }

  // Merges two contacts: keeps `keepId`, reassigns leads/threads from
  // `discardId`, soft-deletes the discarded contact. Org-scoped.
  async merge(ctx: AuthContext, req: ContactMergeRequest): Promise<ContactDto> {
    if (req.keepId === req.discardId) {
      throw Errors.conflict('Cannot merge a contact with itself');
    }
    const [keep, discard] = await Promise.all([
      this.prisma.contact.findFirst({ where: { id: req.keepId, orgId: ctx.orgId, deletedAt: null } }),
      this.prisma.contact.findFirst({ where: { id: req.discardId, orgId: ctx.orgId, deletedAt: null } }),
    ]);
    if (!keep || !discard) throw Errors.notFound('One or both contacts not found');

    const merged = await this.prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { contactId: discard.id, orgId: ctx.orgId },
        data: { contactId: keep.id },
      });
      await tx.messageThread.updateMany({
        where: { contactId: discard.id, orgId: ctx.orgId },
        data: { contactId: keep.id },
      });
      await tx.activity.updateMany({
        where: { contactId: discard.id, orgId: ctx.orgId },
        data: { contactId: keep.id },
      });
      const updated = await tx.contact.update({
        where: { id: keep.id },
        data: {
          email: keep.email ?? discard.email,
          phone: keep.phone ?? discard.phone,
          emailNorm: keep.emailNorm ?? discard.emailNorm,
          phoneNorm: keep.phoneNorm ?? discard.phoneNorm,
        },
      });
      await tx.contact.update({
        where: { id: discard.id },
        data: { deletedAt: new Date() },
      });
      await tx.activity.create({
        data: {
          orgId: ctx.orgId,
          kind: 'CONTACT_MERGED',
          contactId: keep.id,
          actorId: ctx.userId,
          payload: { mergedFrom: discard.id, mergedName: discard.name },
        },
      });
      return updated;
    });

    await this.audit.log(ctx, {
      action: 'contact.merged',
      entityType: 'Contact',
      entityId: keep.id,
      before: { discardId: discard.id, discardName: discard.name },
      after: { keepId: keep.id },
    });
    return toDto(merged);
  }
}

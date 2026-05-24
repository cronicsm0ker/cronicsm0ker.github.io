import type { PrismaClient } from '@roofops/db';
import type {
  PriceBookItem as PriceBookItemDto,
  PriceBookItemInput,
  PriceBookItemPatch,
  PriceBookKind,
} from '@roofops/types';
import { PriceBookItemInputSchema } from '@roofops/types';
import type { AuthContext } from '../lib/auth-context.js';
import { Errors } from '../errors.js';
import { AuditLogger } from './audit.js';

interface PriceBookRow {
  id: string;
  orgId: string;
  kind: PriceBookKind;
  name: string;
  description: string | null;
  unit: string;
  unitCostCents: bigint;
  markupBps: number;
  wasteFactorBps: number;
  sku: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: PriceBookRow): PriceBookItemDto {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind,
    name: row.name,
    description: row.description,
    unit: row.unit,
    unitCostCents: row.unitCostCents.toString(),
    markupBps: row.markupBps,
    wasteFactorBps: row.wasteFactorBps,
    sku: row.sku,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function unitCostToBigInt(v: PriceBookItemInput['unitCostCents']): bigint {
  return typeof v === 'number' ? BigInt(v) : BigInt(v);
}

export interface CsvImportResult {
  inserted: number;
  updated: number;
  errors: Array<{ index: number; error: string; row?: Record<string, unknown> }>;
}

export class PriceBookService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditLogger,
  ) {}

  async list(
    ctx: AuthContext,
    opts: { kind?: PriceBookKind; includeArchived?: boolean; search?: string },
  ): Promise<PriceBookItemDto[]> {
    const rows = await this.prisma.priceBookItem.findMany({
      where: {
        orgId: ctx.orgId,
        ...(opts.includeArchived ? {} : { archivedAt: null }),
        ...(opts.kind ? { kind: opts.kind } : {}),
        ...(opts.search
          ? {
              OR: [
                { name: { contains: opts.search, mode: 'insensitive' as const } },
                { sku: { contains: opts.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  }

  async create(ctx: AuthContext, input: PriceBookItemInput): Promise<PriceBookItemDto> {
    this.requireAdmin(ctx);
    const created = await this.prisma.priceBookItem
      .create({
        data: {
          orgId: ctx.orgId,
          kind: input.kind,
          name: input.name,
          description: input.description ?? null,
          unit: input.unit,
          unitCostCents: unitCostToBigInt(input.unitCostCents),
          markupBps: input.markupBps,
          wasteFactorBps: input.wasteFactorBps,
          sku: input.sku ?? null,
        },
      })
      .catch((err: { code?: string }) => {
        if (err.code === 'P2002') {
          throw Errors.conflict(`Price book item "${input.name}" already exists`);
        }
        throw err;
      });
    await this.audit.log(ctx, {
      action: 'price_book.created',
      entityType: 'PriceBookItem',
      entityId: created.id,
      after: { name: created.name, kind: created.kind },
    });
    return toDto(created);
  }

  async update(
    ctx: AuthContext,
    id: string,
    patch: PriceBookItemPatch,
  ): Promise<PriceBookItemDto> {
    this.requireAdmin(ctx);
    const before = await this.prisma.priceBookItem.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!before) throw Errors.notFound('Price book item not found');

    const updated = await this.prisma.priceBookItem.update({
      where: { id },
      data: {
        kind: patch.kind ?? before.kind,
        name: patch.name ?? before.name,
        description: patch.description ?? before.description,
        unit: patch.unit ?? before.unit,
        unitCostCents:
          patch.unitCostCents !== undefined
            ? unitCostToBigInt(patch.unitCostCents)
            : before.unitCostCents,
        markupBps: patch.markupBps ?? before.markupBps,
        wasteFactorBps: patch.wasteFactorBps ?? before.wasteFactorBps,
        sku: patch.sku ?? before.sku,
        archivedAt:
          patch.archived === undefined
            ? before.archivedAt
            : patch.archived
              ? before.archivedAt ?? new Date()
              : null,
      },
    });
    await this.audit.log(ctx, {
      action: 'price_book.updated',
      entityType: 'PriceBookItem',
      entityId: id,
      before: { name: before.name, unitCostCents: before.unitCostCents.toString() },
      after: { name: updated.name, unitCostCents: updated.unitCostCents.toString() },
    });
    return toDto(updated);
  }

  async delete(ctx: AuthContext, id: string): Promise<void> {
    this.requireAdmin(ctx);
    const before = await this.prisma.priceBookItem.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!before) throw Errors.notFound('Price book item not found');
    await this.prisma.priceBookItem.delete({ where: { id } });
    await this.audit.log(ctx, {
      action: 'price_book.deleted',
      entityType: 'PriceBookItem',
      entityId: id,
      before: { name: before.name },
    });
  }

  // CSV import. Each row is validated against PriceBookItemInputSchema;
  // errors are accumulated rather than rejecting the whole batch so the
  // user can fix the few bad rows and re-upload only those.
  // Conflict on (org_id, name) -> update existing row (upsert semantics).
  async importRows(
    ctx: AuthContext,
    rawRows: unknown[],
  ): Promise<CsvImportResult> {
    this.requireAdmin(ctx);
    const result: CsvImportResult = { inserted: 0, updated: 0, errors: [] };

    await this.prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < rawRows.length; i += 1) {
          const parsed = PriceBookItemInputSchema.safeParse(rawRows[i]);
          if (!parsed.success) {
            result.errors.push({
              index: i,
              error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
              row: rawRows[i] as Record<string, unknown> | undefined,
            });
            continue;
          }
          const input = parsed.data;
          const data = {
            orgId: ctx.orgId,
            kind: input.kind,
            name: input.name,
            description: input.description ?? null,
            unit: input.unit,
            unitCostCents: unitCostToBigInt(input.unitCostCents),
            markupBps: input.markupBps,
            wasteFactorBps: input.wasteFactorBps,
            sku: input.sku ?? null,
          };
          const upserted = await tx.priceBookItem.upsert({
            where: { orgId_name: { orgId: ctx.orgId, name: input.name } },
            create: data,
            update: data,
          });
          // Created has updatedAt === createdAt (within a millisecond).
          if (upserted.updatedAt.getTime() - upserted.createdAt.getTime() < 5) {
            result.inserted += 1;
          } else {
            result.updated += 1;
          }
        }
      },
      { timeout: 30_000 },
    );

    await this.audit.log(ctx, {
      action: 'price_book.imported',
      entityType: 'PriceBookItem',
      entityId: 'batch',
      after: { inserted: result.inserted, updated: result.updated, errors: result.errors.length },
    });

    return result;
  }

  private requireAdmin(ctx: AuthContext): void {
    if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
      throw Errors.forbidden('Only owners and admins can manage the price book');
    }
  }
}

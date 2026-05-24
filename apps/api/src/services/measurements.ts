import type { PrismaClient } from '@roofops/db';
import type {
  CreateManualPolygonMeasurement,
  CreateMeasurement,
  Measurement as MeasurementDto,
  MeasurementMethod,
  MeasurementUnit,
} from '@roofops/types';
import type { AuthContext } from '../lib/auth-context.js';
import { Errors } from '../errors.js';
import {
  polygonAreaSqMeters,
  sqFeetToRoofingSquares,
  sqMetersToSqFeet,
} from '../lib/geo.js';
import { AuditLogger } from './audit.js';

interface MeasurementRow {
  id: string;
  orgId: string;
  leadId: string | null;
  assetId: string | null;
  method: MeasurementMethod;
  label: string;
  value: { toString: () => string } | string;
  unit: MeasurementUnit;
  confidence: number;
  notes: string | null;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: MeasurementRow): MeasurementDto {
  return {
    id: row.id,
    orgId: row.orgId,
    leadId: row.leadId,
    assetId: row.assetId,
    method: row.method,
    label: row.label,
    value: typeof row.value === 'string' ? row.value : row.value.toString(),
    unit: row.unit,
    confidence: row.confidence,
    notes: row.notes,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class MeasurementsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditLogger,
  ) {}

  async list(ctx: AuthContext, leadId: string): Promise<MeasurementDto[]> {
    await this.assertLeadExists(ctx, leadId);
    const rows = await this.prisma.measurement.findMany({
      where: { orgId: ctx.orgId, leadId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async createManual(ctx: AuthContext, input: CreateMeasurement): Promise<MeasurementDto> {
    await this.assertLeadExists(ctx, input.leadId);
    const created = await this.prisma.measurement.create({
      data: {
        orgId: ctx.orgId,
        leadId: input.leadId,
        assetId: input.assetId ?? null,
        method: input.method,
        label: input.label,
        value: typeof input.value === 'number' ? input.value.toFixed(2) : input.value,
        unit: input.unit,
        confidence: input.confidence,
        notes: input.notes ?? null,
        payload: (input.payload ?? null) as never,
      },
    });
    await this.recordActivity(ctx, created.id, input.leadId, created.method, created.label);
    return toDto(created);
  }

  // Manual polygon: client sends lat/lng vertices; we compute area
  // server-side so it can't be inflated. Stored confidence 70 because
  // manual tracing of satellite imagery is reasonably accurate but not
  // certified.
  async createFromPolygon(
    ctx: AuthContext,
    input: CreateManualPolygonMeasurement,
  ): Promise<MeasurementDto> {
    await this.assertLeadExists(ctx, input.leadId);
    const sqM = polygonAreaSqMeters(input.polygon);
    const sqFt = sqMetersToSqFeet(sqM);
    const value =
      input.unit === 'SQUARES' ? sqFeetToRoofingSquares(sqFt).toFixed(2) : sqFt.toFixed(2);

    const created = await this.prisma.measurement.create({
      data: {
        orgId: ctx.orgId,
        leadId: input.leadId,
        method: 'MANUAL_POLYGON',
        label: input.label,
        value,
        unit: input.unit,
        confidence: 70,
        notes: input.notes ?? null,
        payload: {
          polygon: input.polygon,
          sqMeters: sqM,
          sqFeet: sqFt,
        } as never,
      },
    });
    await this.recordActivity(ctx, created.id, input.leadId, 'MANUAL_POLYGON', input.label);
    return toDto(created);
  }

  async delete(ctx: AuthContext, id: string): Promise<void> {
    const before = await this.prisma.measurement.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!before) throw Errors.notFound('Measurement not found');
    await this.prisma.measurement.delete({ where: { id } });
    await this.audit.log(ctx, {
      action: 'measurement.deleted',
      entityType: 'Measurement',
      entityId: id,
      before: { label: before.label, method: before.method, value: before.value.toString() },
    });
  }

  private async assertLeadExists(ctx: AuthContext, leadId: string): Promise<void> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, orgId: ctx.orgId, deletedAt: null },
    });
    if (!lead) throw Errors.notFound('Lead not found');
  }

  private async recordActivity(
    ctx: AuthContext,
    measurementId: string,
    leadId: string,
    method: MeasurementMethod,
    label: string,
  ): Promise<void> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, orgId: ctx.orgId },
      select: { contactId: true },
    });
    await this.prisma.activity.create({
      data: {
        orgId: ctx.orgId,
        kind: 'MEASUREMENT_RECORDED',
        actorId: ctx.userId,
        leadId,
        contactId: lead?.contactId ?? null,
        payload: { measurementId, method, label },
      },
    });
    await this.audit.log(ctx, {
      action: 'measurement.created',
      entityType: 'Measurement',
      entityId: measurementId,
      after: { leadId, method, label },
    });
  }
}

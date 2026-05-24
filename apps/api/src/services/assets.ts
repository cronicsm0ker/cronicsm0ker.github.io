import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@roofops/db';
import type {
  Asset as AssetDto,
  AssetKind,
  AssetOwnerType,
  AssetStatus,
  AllowedMimeType,
  RequestUploadRequest,
  UploadTicket,
} from '@roofops/types';
import type { AuthContext } from '../lib/auth-context.js';
import { Errors } from '../errors.js';
import type { AssetStorage } from '../lib/s3.js';
import { AuditLogger } from './audit.js';

interface AssetRow {
  id: string;
  orgId: string;
  ownerType: AssetOwnerType;
  ownerId: string;
  kind: AssetKind;
  mimeType: string;
  sizeBytes: bigint;
  s3Key: string;
  thumbnailKey: string | null;
  contentHash: string;
  status: AssetStatus;
  uploadedBy: string | null;
  meta: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: AssetRow): AssetDto {
  return {
    id: row.id,
    orgId: row.orgId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    kind: row.kind,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes.toString(),
    s3Key: row.s3Key,
    thumbnailKey: row.thumbnailKey,
    contentHash: row.contentHash,
    status: row.status,
    uploadedBy: row.uploadedBy,
    meta: (row.meta as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sanitizeFilename(name?: string): string {
  if (!name) return 'file';
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 80);
}

export class AssetsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditLogger,
    private readonly storage: AssetStorage | null,
  ) {}

  isConfigured(): boolean {
    return this.storage !== null;
  }

  async requestUpload(ctx: AuthContext, req: RequestUploadRequest): Promise<UploadTicket> {
    if (!this.storage) {
      throw Errors.conflict('Asset storage is not configured on this server');
    }
    await this.assertOwnerExists(ctx, req.ownerType, req.ownerId);

    // Placeholder content hash; the client supplies the real SHA-256 on
    // finalize. We seed with the assetId so the row passes NOT NULL.
    const assetId = randomUUID();
    const filename = sanitizeFilename(req.filename);
    const key = `orgs/${ctx.orgId}/${req.ownerType.toLowerCase()}/${req.ownerId}/${assetId}-${filename}`;

    const ticket = await this.storage.presignPut({
      key,
      contentType: req.mimeType,
      sizeBytes: req.sizeBytes,
      expiresInSeconds: 300,
    });

    await this.prisma.asset.create({
      data: {
        id: assetId,
        orgId: ctx.orgId,
        ownerType: req.ownerType,
        ownerId: req.ownerId,
        kind: req.kind,
        mimeType: req.mimeType,
        sizeBytes: BigInt(req.sizeBytes),
        s3Key: key,
        contentHash: `pending-${assetId}`,
        status: 'PENDING',
        uploadedBy: ctx.userId,
      },
    });

    return {
      assetId,
      uploadUrl: ticket.url,
      uploadMethod: 'PUT',
      headers: ticket.headers,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  async finalize(ctx: AuthContext, id: string, contentHash: string): Promise<AssetDto> {
    if (!this.storage) {
      throw Errors.conflict('Asset storage is not configured on this server');
    }
    const before = await this.prisma.asset.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!before) throw Errors.notFound('Asset not found');
    if (before.status === 'READY') return toDto(before);

    // Confirm the object actually landed in S3 before we trust the
    // client-supplied hash. The client could otherwise mark a non-existent
    // key as READY and break downstream consumers.
    const head = await this.storage.head(before.s3Key);
    if (!head.exists) {
      throw Errors.conflict('Object not found in storage; upload may have failed');
    }
    if (head.sizeBytes !== null && head.sizeBytes !== Number(before.sizeBytes)) {
      throw Errors.conflict(
        `Uploaded size (${head.sizeBytes}) does not match requested size (${before.sizeBytes})`,
      );
    }

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        contentHash,
        status: 'READY',
      },
    });

    await this.prisma.activity.create({
      data: {
        orgId: ctx.orgId,
        kind: 'ASSET_UPLOADED',
        actorId: ctx.userId,
        leadId: before.ownerType === 'LEAD' ? before.ownerId : null,
        contactId: before.ownerType === 'CONTACT' ? before.ownerId : null,
        payload: { assetId: id, kind: before.kind, mimeType: before.mimeType },
      },
    });
    await this.audit.log(ctx, {
      action: 'asset.finalized',
      entityType: 'Asset',
      entityId: id,
      after: { status: 'READY', contentHash, kind: before.kind },
    });
    return toDto(updated);
  }

  async listForOwner(
    ctx: AuthContext,
    ownerType: AssetOwnerType,
    ownerId: string,
  ): Promise<AssetDto[]> {
    const rows = await this.prisma.asset.findMany({
      where: { orgId: ctx.orgId, ownerType, ownerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async getWithDownloadUrl(
    ctx: AuthContext,
    id: string,
  ): Promise<{ asset: AssetDto; downloadUrl: string | null }> {
    const row = await this.prisma.asset.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!row) throw Errors.notFound('Asset not found');
    const downloadUrl =
      this.storage && row.status === 'READY'
        ? await this.storage.presignGet({ key: row.s3Key })
        : null;
    return { asset: toDto(row), downloadUrl };
  }

  async delete(ctx: AuthContext, id: string): Promise<void> {
    const row = await this.prisma.asset.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!row) throw Errors.notFound('Asset not found');
    if (this.storage) {
      await this.storage.delete(row.s3Key).catch(() => undefined);
      if (row.thumbnailKey) {
        await this.storage.delete(row.thumbnailKey).catch(() => undefined);
      }
    }
    await this.prisma.asset.delete({ where: { id } });
    await this.audit.log(ctx, {
      action: 'asset.deleted',
      entityType: 'Asset',
      entityId: id,
      before: { kind: row.kind, s3Key: row.s3Key },
    });
  }

  private async assertOwnerExists(
    ctx: AuthContext,
    ownerType: AssetOwnerType,
    ownerId: string,
  ): Promise<void> {
    const where = { id: ownerId, orgId: ctx.orgId } as const;
    if (ownerType === 'CONTACT') {
      const row = await this.prisma.contact.findFirst({ where: { ...where, deletedAt: null } });
      if (!row) throw Errors.notFound('Contact not found');
    } else if (ownerType === 'LEAD') {
      const row = await this.prisma.lead.findFirst({ where: { ...where, deletedAt: null } });
      if (!row) throw Errors.notFound('Lead not found');
    } else if (ownerType === 'PROPOSAL') {
      const row = await this.prisma.proposal.findFirst({ where });
      if (!row) throw Errors.notFound('Proposal not found');
    }
  }
}

export type { AllowedMimeType };

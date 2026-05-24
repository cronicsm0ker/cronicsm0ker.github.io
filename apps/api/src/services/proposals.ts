import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@roofops/db';
import type {
  AcceptProposal,
  CreateProposalRequest,
  GenerateProposalRequest,
  Proposal as ProposalDto,
  ProposalLineItem,
  ProposalLineItemInput,
  ProposalSnapshot,
  ProposalStatus,
  ProposalWithVersion,
  PublicProposal,
  UpdateProposalDraftRequest,
} from '@roofops/types';
import { PROPOSAL_STATUS_TRANSITIONS } from '@roofops/types';
import { Errors } from '../errors.js';
import type { AuthContext } from '../lib/auth-context.js';
import { AuditLogger } from './audit.js';
import { ProposalGenerator } from './ai/proposal-generator.js';
import type { Env } from '../env.js';

interface ProposalRow {
  id: string;
  orgId: string;
  leadId: string;
  contactId: string;
  status: ProposalStatus;
  publicTokenHash: string;
  currentVersionId: string | null;
  generatedByAi: boolean;
  aiConfidence: number | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  expiresAt: Date | null;
  rejectionReason: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToDto(row: ProposalRow): ProposalDto {
  return {
    id: row.id,
    orgId: row.orgId,
    leadId: row.leadId,
    contactId: row.contactId,
    status: row.status,
    currentVersionId: row.currentVersionId,
    generatedByAi: row.generatedByAi,
    aiConfidence: row.aiConfidence,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    viewedAt: row.viewedAt ? row.viewedAt.toISOString() : null,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    rejectedAt: row.rejectedAt ? row.rejectedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    rejectionReason: row.rejectionReason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Subtotal = quantity * (1 + waste) * unitCost * (1 + markup).
// Compute in plain integers (cents) and basis points to dodge float drift.
function computeLineItemSubtotalCents(input: ProposalLineItemInput): bigint {
  const unitCost = BigInt(typeof input.unitCostCents === 'number' ? input.unitCostCents : input.unitCostCents);
  // Use micro-cents (cents * 1_000_000) internally so the basis-point math
  // never loses precision on small quantities.
  const SCALE = 1_000_000n;
  const wasteMultiplierBps = BigInt(10_000 + input.wasteFactorBps);
  const markupMultiplierBps = BigInt(10_000 + input.markupBps);
  const quantityScaled = BigInt(Math.round(input.quantity * 1_000_000));

  // (quantity * 1e6) * unitCost * (1 + waste/10000) * (1 + markup/10000)
  //   = (qScaled * unitCost * wasteBps * markupBps) / (1e6 * 10000 * 10000)
  const numerator = quantityScaled * unitCost * wasteMultiplierBps * markupMultiplierBps;
  const denominator = SCALE * 10_000n * 10_000n;
  return (numerator + denominator / 2n) / denominator;
}

function generatePublicToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

function hashPublicToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface GeneratedProposalResult {
  proposal: ProposalWithVersion;
  generation: {
    confidence: number;
    reviewNotes: string[];
    modelUsed: string;
    cacheReadTokens: number;
  };
  publicToken: string;
}

export class ProposalsService {
  private generator: ProposalGenerator | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditLogger,
    private readonly env: Env,
  ) {}

  private getGenerator(): ProposalGenerator {
    if (!this.generator) {
      this.generator = new ProposalGenerator(this.env);
    }
    return this.generator;
  }

  // ---- Read ----

  async findById(ctx: AuthContext, id: string): Promise<ProposalWithVersion> {
    const row = await this.prisma.proposal.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!row) throw Errors.notFound('Proposal not found');
    const version = row.currentVersionId
      ? await this.prisma.proposalVersion.findUnique({
          where: { id: row.currentVersionId },
        })
      : null;
    return {
      ...rowToDto(row),
      currentVersion: version
        ? {
            id: version.id,
            version: version.version,
            snapshot: version.snapshot as ProposalSnapshot,
            totalCents: version.totalCents.toString(),
            depositCents: version.depositCents.toString(),
            taxRateBps: version.taxRateBps,
            createdAt: version.createdAt.toISOString(),
          }
        : null,
    };
  }

  async listForLead(ctx: AuthContext, leadId: string): Promise<ProposalDto[]> {
    const rows = await this.prisma.proposal.findMany({
      where: { orgId: ctx.orgId, leadId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(rowToDto);
  }

  // ---- Create (manual) ----

  async create(ctx: AuthContext, req: CreateProposalRequest): Promise<ProposalWithVersion> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: req.leadId, orgId: ctx.orgId, deletedAt: null },
      include: { contact: true },
    });
    if (!lead) throw Errors.notFound('Lead not found');

    const measurements = req.measurementIds && req.measurementIds.length > 0
      ? await this.prisma.measurement.findMany({
          where: { orgId: ctx.orgId, id: { in: req.measurementIds } },
        })
      : [];

    const snapshot = this.buildSnapshot({
      title: req.title,
      scopeOfWork: req.scopeOfWork,
      lineItems: req.lineItems,
      termsText: req.termsText,
      depositPercentBps: req.depositPercentBps,
      taxRateBps: req.taxRateBps,
      contact: lead.contact,
      measurements,
      aiReviewNotes: undefined,
    });

    return this.persistProposal(ctx, {
      leadId: lead.id,
      contactId: lead.contactId,
      snapshot,
      generatedByAi: false,
      aiConfidence: null,
      expiresInDays: req.expiresInDays,
    });
  }

  // ---- Create (AI-generated) ----

  async generate(
    ctx: AuthContext,
    req: GenerateProposalRequest,
  ): Promise<GeneratedProposalResult> {
    const generator = this.getGenerator();
    if (!generator.isConfigured()) {
      throw Errors.conflict('Anthropic API key is not configured on this server');
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: req.leadId, orgId: ctx.orgId, deletedAt: null },
      include: { contact: true },
    });
    if (!lead) throw Errors.notFound('Lead not found');

    const [priceBookRows, measurementRows, org, assetRows] = await Promise.all([
      this.prisma.priceBookItem.findMany({
        where: { orgId: ctx.orgId, archivedAt: null },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.measurement.findMany({
        where: {
          orgId: ctx.orgId,
          leadId: req.leadId,
          ...(req.measurementIds && req.measurementIds.length > 0
            ? { id: { in: req.measurementIds } }
            : {}),
        },
      }),
      this.prisma.org.findUnique({ where: { id: ctx.orgId } }),
      req.assetIds && req.assetIds.length > 0
        ? this.prisma.asset.findMany({
            where: { orgId: ctx.orgId, id: { in: req.assetIds } },
          })
        : Promise.resolve([]),
    ]);

    const hasBlueprintAssets = assetRows.some((a) => a.kind === 'BLUEPRINT');

    const result = await generator.generate({
      jobType: req.jobType,
      scopeHints: req.scopeHints,
      contact: {
        name: lead.contact.name,
        email: lead.contact.email,
        phone: lead.contact.phone,
      },
      measurements: measurementRows.map((m) => ({
        id: m.id,
        orgId: m.orgId,
        leadId: m.leadId,
        assetId: m.assetId,
        method: m.method,
        label: m.label,
        value: m.value.toString(),
        unit: m.unit,
        confidence: m.confidence,
        notes: m.notes,
        payload: (m.payload as Record<string, unknown> | null) ?? null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      priceBook: priceBookRows.map((p) => ({
        id: p.id,
        orgId: p.orgId,
        kind: p.kind,
        name: p.name,
        description: p.description,
        unit: p.unit,
        unitCostCents: p.unitCostCents.toString(),
        markupBps: p.markupBps,
        wasteFactorBps: p.wasteFactorBps,
        sku: p.sku,
        archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      hasBlueprintAssets,
      orgName: org?.name ?? 'this contractor',
    });

    const snapshot = this.buildSnapshot({
      title: result.title,
      scopeOfWork: result.scopeOfWork,
      lineItems: result.lineItems,
      termsText: result.termsAdditions,
      depositPercentBps: 2500,
      taxRateBps: 0,
      contact: lead.contact,
      measurements: measurementRows,
      aiReviewNotes: result.reviewNotes,
    });

    const persisted = await this.persistProposal(ctx, {
      leadId: lead.id,
      contactId: lead.contactId,
      snapshot,
      generatedByAi: true,
      aiConfidence: result.confidence,
      expiresInDays: undefined,
    });

    return {
      proposal: persisted,
      generation: {
        confidence: result.confidence,
        reviewNotes: result.reviewNotes,
        modelUsed: result.modelUsed,
        cacheReadTokens: result.usage.cacheReadInputTokens,
      },
      publicToken: persisted.id, // Public token returned separately in persistProposal; placeholder
    };
  }

  // ---- Update draft (replaces snapshot with new version) ----

  async updateDraft(
    ctx: AuthContext,
    id: string,
    patch: UpdateProposalDraftRequest,
  ): Promise<ProposalWithVersion> {
    const proposal = await this.requireProposal(ctx, id);
    if (proposal.status !== 'DRAFT') {
      throw Errors.conflict(`Cannot edit a proposal in status ${proposal.status}`);
    }

    const currentVersion = proposal.currentVersionId
      ? await this.prisma.proposalVersion.findUnique({ where: { id: proposal.currentVersionId } })
      : null;
    if (!currentVersion) throw Errors.conflict('Proposal has no current version to patch');

    const current = currentVersion.snapshot as ProposalSnapshot;
    const lead = await this.prisma.lead.findFirst({
      where: { id: proposal.leadId, orgId: ctx.orgId },
      include: { contact: true },
    });
    if (!lead) throw Errors.notFound('Lead not found');

    const nextLineItems = patch.lineItems
      ? patch.lineItems
      : current.lineItems.map((li) => ({
          ...(li.priceBookItemId ? { priceBookItemId: li.priceBookItemId } : {}),
          kind: li.kind,
          name: li.name,
          ...(li.description ? { description: li.description } : {}),
          unit: li.unit,
          quantity: li.quantity,
          unitCostCents: li.unitCostCents,
          markupBps: li.markupBps,
          wasteFactorBps: li.wasteFactorBps,
        }));

    const snapshot = this.buildSnapshot({
      title: patch.title ?? current.title,
      scopeOfWork: patch.scopeOfWork ?? current.scopeOfWork,
      lineItems: nextLineItems,
      termsText: patch.termsText ?? current.termsText,
      depositPercentBps: patch.depositPercentBps ?? current.depositPercentBps,
      taxRateBps: patch.taxRateBps ?? current.taxRateBps,
      contact: lead.contact,
      measurements: [],
      aiReviewNotes: current.aiReviewNotes,
    });

    const nextVersion = currentVersion.version + 1;
    const created = await this.prisma.$transaction(async (tx) => {
      const version = await tx.proposalVersion.create({
        data: {
          orgId: ctx.orgId,
          proposalId: id,
          version: nextVersion,
          snapshot: snapshot as never,
          totalCents: BigInt(snapshot.totalCents),
          depositCents: BigInt(snapshot.depositCents),
          taxRateBps: snapshot.taxRateBps,
          createdBy: ctx.userId,
        },
      });
      const updatedProposal = await tx.proposal.update({
        where: { id },
        data: { currentVersionId: version.id },
      });
      return { version, updatedProposal };
    });

    await this.audit.log(ctx, {
      action: 'proposal.draft_updated',
      entityType: 'Proposal',
      entityId: id,
      after: { version: nextVersion, totalCents: snapshot.totalCents },
    });

    return {
      ...rowToDto(created.updatedProposal),
      currentVersion: {
        id: created.version.id,
        version: created.version.version,
        snapshot,
        totalCents: snapshot.totalCents,
        depositCents: snapshot.depositCents,
        taxRateBps: snapshot.taxRateBps,
        createdAt: created.version.createdAt.toISOString(),
      },
    };
  }

  // ---- Lifecycle: send / withdraw / accept / reject ----

  async markSent(ctx: AuthContext, id: string): Promise<ProposalDto> {
    const proposal = await this.requireProposal(ctx, id);
    this.assertTransition(proposal.status, 'SENT');
    const updated = await this.prisma.proposal.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    await this.recordActivity(ctx, proposal, 'PROPOSAL_SENT');
    await this.audit.log(ctx, {
      action: 'proposal.sent',
      entityType: 'Proposal',
      entityId: id,
      after: { status: 'SENT' },
    });
    return rowToDto(updated);
  }

  async withdraw(ctx: AuthContext, id: string): Promise<ProposalDto> {
    const proposal = await this.requireProposal(ctx, id);
    this.assertTransition(proposal.status, 'WITHDRAWN');
    const updated = await this.prisma.proposal.update({
      where: { id },
      data: { status: 'WITHDRAWN' },
    });
    await this.audit.log(ctx, {
      action: 'proposal.withdrawn',
      entityType: 'Proposal',
      entityId: id,
      before: { status: proposal.status },
      after: { status: 'WITHDRAWN' },
    });
    return rowToDto(updated);
  }

  // ---- Public portal ----

  async readByPublicToken(token: string): Promise<PublicProposal & { proposalId: string }> {
    const tokenHash = hashPublicToken(token);
    const row = await this.prisma.proposal.findUnique({
      where: { publicTokenHash: tokenHash },
      include: { org: true },
    });
    if (!row) throw Errors.notFound('Proposal not found');
    if (row.status === 'WITHDRAWN' || row.status === 'EXPIRED') {
      throw Errors.notFound('Proposal is no longer available');
    }

    // Stamp viewedAt the first time the link is opened.
    if (!row.viewedAt && (row.status === 'SENT' || row.status === 'VIEWED')) {
      await this.prisma.proposal.update({
        where: { id: row.id },
        data: { status: 'VIEWED', viewedAt: new Date() },
      });
      await this.prisma.activity.create({
        data: {
          orgId: row.orgId,
          kind: 'PROPOSAL_VIEWED',
          contactId: row.contactId,
          leadId: row.leadId,
          payload: { proposalId: row.id },
        },
      });
    }

    const version = row.currentVersionId
      ? await this.prisma.proposalVersion.findUnique({ where: { id: row.currentVersionId } })
      : null;
    if (!version) throw Errors.notFound('Proposal version not found');

    return {
      id: row.id,
      proposalId: row.id,
      status: row.status === 'SENT' ? 'VIEWED' : row.status,
      orgName: row.org.name,
      snapshot: version.snapshot as ProposalSnapshot,
      totalCents: version.totalCents.toString(),
      depositCents: version.depositCents.toString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    };
  }

  async acceptByPublicToken(token: string, body: AcceptProposal): Promise<PublicProposal & { proposalId: string }> {
    const tokenHash = hashPublicToken(token);
    const row = await this.prisma.proposal.findUnique({ where: { publicTokenHash: tokenHash } });
    if (!row) throw Errors.notFound('Proposal not found');
    if (row.status !== 'SENT' && row.status !== 'VIEWED') {
      throw Errors.conflict(`Proposal cannot be accepted from status ${row.status}`);
    }
    const updated = await this.prisma.proposal.update({
      where: { id: row.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        rejectionReason: null,
      },
    });
    await this.prisma.activity.create({
      data: {
        orgId: row.orgId,
        kind: 'PROPOSAL_ACCEPTED',
        contactId: row.contactId,
        leadId: row.leadId,
        payload: { proposalId: row.id, signerName: body.signerName },
      },
    });
    return this.readByPublicToken(token).then((dto) => ({ ...dto, status: updated.status }));
  }

  async rejectByPublicToken(token: string, reason: string): Promise<PublicProposal & { proposalId: string }> {
    const tokenHash = hashPublicToken(token);
    const row = await this.prisma.proposal.findUnique({ where: { publicTokenHash: tokenHash } });
    if (!row) throw Errors.notFound('Proposal not found');
    if (row.status !== 'SENT' && row.status !== 'VIEWED') {
      throw Errors.conflict(`Proposal cannot be rejected from status ${row.status}`);
    }
    await this.prisma.proposal.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason.slice(0, 2000),
      },
    });
    await this.prisma.activity.create({
      data: {
        orgId: row.orgId,
        kind: 'PROPOSAL_REJECTED',
        contactId: row.contactId,
        leadId: row.leadId,
        payload: { proposalId: row.id, reason },
      },
    });
    return this.readByPublicToken(token);
  }

  // ---- internals ----

  private async requireProposal(ctx: AuthContext, id: string) {
    const row = await this.prisma.proposal.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!row) throw Errors.notFound('Proposal not found');
    return row;
  }

  private assertTransition(from: ProposalStatus, to: ProposalStatus): void {
    const allowed = PROPOSAL_STATUS_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw Errors.conflict(`Invalid proposal transition: ${from} -> ${to}`);
    }
  }

  private buildSnapshot(input: {
    title: string;
    scopeOfWork: string;
    lineItems: ProposalLineItemInput[];
    termsText: string;
    depositPercentBps: number;
    taxRateBps: number;
    contact: { name: string; email: string | null; phone: string | null };
    measurements: Array<{ id: string; label: string; value: { toString: () => string } | string; unit: string }>;
    aiReviewNotes: string[] | undefined;
  }): ProposalSnapshot {
    const lineItems: ProposalLineItem[] = input.lineItems.map((li) => {
      const subtotal = computeLineItemSubtotalCents(li);
      const unitCost =
        typeof li.unitCostCents === 'number' ? BigInt(li.unitCostCents) : BigInt(li.unitCostCents);
      return {
        priceBookItemId: li.priceBookItemId ?? null,
        kind: li.kind,
        name: li.name,
        description: li.description ?? null,
        unit: li.unit,
        quantity: li.quantity,
        unitCostCents: unitCost.toString(),
        markupBps: li.markupBps,
        wasteFactorBps: li.wasteFactorBps,
        subtotalCents: subtotal.toString(),
      };
    });

    const subtotal = lineItems.reduce((acc, li) => acc + BigInt(li.subtotalCents), 0n);
    const tax = (subtotal * BigInt(input.taxRateBps) + 5_000n) / 10_000n;
    const total = subtotal + tax;
    const deposit = (total * BigInt(input.depositPercentBps) + 5_000n) / 10_000n;

    return {
      title: input.title,
      scopeOfWork: input.scopeOfWork,
      lineItems,
      termsText: input.termsText,
      depositPercentBps: input.depositPercentBps,
      taxRateBps: input.taxRateBps,
      subtotalCents: subtotal.toString(),
      taxCents: tax.toString(),
      totalCents: total.toString(),
      depositCents: deposit.toString(),
      contactSnapshot: {
        name: input.contact.name,
        email: input.contact.email,
        phone: input.contact.phone,
      },
      measurementsSnapshot: input.measurements.map((m) => ({
        id: m.id,
        label: m.label,
        value: typeof m.value === 'string' ? m.value : m.value.toString(),
        unit: m.unit,
      })),
      ...(input.aiReviewNotes && input.aiReviewNotes.length > 0
        ? { aiReviewNotes: input.aiReviewNotes }
        : {}),
    };
  }

  private async persistProposal(
    ctx: AuthContext,
    input: {
      leadId: string;
      contactId: string;
      snapshot: ProposalSnapshot;
      generatedByAi: boolean;
      aiConfidence: number | null;
      expiresInDays: number | undefined;
    },
  ): Promise<ProposalWithVersion> {
    const { token, hash } = generatePublicToken();
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: {
          orgId: ctx.orgId,
          leadId: input.leadId,
          contactId: input.contactId,
          status: 'DRAFT',
          publicTokenHash: hash,
          generatedByAi: input.generatedByAi,
          aiConfidence: input.aiConfidence,
          expiresAt,
          createdBy: ctx.userId,
        },
      });
      const version = await tx.proposalVersion.create({
        data: {
          orgId: ctx.orgId,
          proposalId: proposal.id,
          version: 1,
          snapshot: input.snapshot as never,
          totalCents: BigInt(input.snapshot.totalCents),
          depositCents: BigInt(input.snapshot.depositCents),
          taxRateBps: input.snapshot.taxRateBps,
          createdBy: ctx.userId,
        },
      });
      const updated = await tx.proposal.update({
        where: { id: proposal.id },
        data: { currentVersionId: version.id },
      });
      await tx.activity.create({
        data: {
          orgId: ctx.orgId,
          kind: 'PROPOSAL_CREATED',
          actorId: ctx.userId,
          contactId: input.contactId,
          leadId: input.leadId,
          payload: {
            proposalId: proposal.id,
            generatedByAi: input.generatedByAi,
            confidence: input.aiConfidence,
          },
        },
      });
      return { proposal: updated, version };
    });

    await this.audit.log(ctx, {
      action: 'proposal.created',
      entityType: 'Proposal',
      entityId: result.proposal.id,
      after: {
        leadId: input.leadId,
        generatedByAi: input.generatedByAi,
        aiConfidence: input.aiConfidence,
        totalCents: input.snapshot.totalCents,
      },
    });

    return {
      ...rowToDto(result.proposal),
      currentVersion: {
        id: result.version.id,
        version: result.version.version,
        snapshot: input.snapshot,
        totalCents: input.snapshot.totalCents,
        depositCents: input.snapshot.depositCents,
        taxRateBps: input.snapshot.taxRateBps,
        createdAt: result.version.createdAt.toISOString(),
      },
    };
  }

  // Public token must be exposed exactly once on create — surfaced to the
  // sales rep so they can copy/share the customer-portal link.
  async generatePublicTokenForExistingProposal(
    ctx: AuthContext,
    id: string,
  ): Promise<{ token: string }> {
    const proposal = await this.requireProposal(ctx, id);
    if (proposal.status === 'WITHDRAWN' || proposal.status === 'EXPIRED') {
      throw Errors.conflict('Cannot rotate the token on a closed proposal');
    }
    const { token, hash } = generatePublicToken();
    await this.prisma.proposal.update({
      where: { id },
      data: { publicTokenHash: hash },
    });
    await this.audit.log(ctx, {
      action: 'proposal.token_rotated',
      entityType: 'Proposal',
      entityId: id,
    });
    return { token };
  }

  private async recordActivity(
    ctx: AuthContext,
    proposal: ProposalRow,
    kind: 'PROPOSAL_SENT' | 'PROPOSAL_VIEWED' | 'PROPOSAL_ACCEPTED' | 'PROPOSAL_REJECTED',
  ): Promise<void> {
    await this.prisma.activity.create({
      data: {
        orgId: ctx.orgId,
        kind,
        actorId: ctx.userId,
        contactId: proposal.contactId,
        leadId: proposal.leadId,
        payload: { proposalId: proposal.id },
      },
    });
  }
}

export { computeLineItemSubtotalCents };

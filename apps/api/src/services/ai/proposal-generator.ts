// AI proposal generator using Claude with structured tool output.
//
// Flow:
//   1) Gather context (lead, contact, measurements, price book).
//   2) Compose a Claude prompt with prompt-caching on the price-book block
//      so generations for the same org cheaply reuse the cached prefix.
//   3) Force a tool call to `submit_proposal` with a strict JSON schema.
//      Validate the tool input with Zod so we never trust a free-form
//      response shape.
//   4) Server computes line-item subtotals and proposal totals — we never
//      trust the model's arithmetic. Reviewer notes drive UI warnings.
//
// Model selection follows the PRD: Sonnet 4.6 default, Opus 4.7 when the
// request includes blueprint assets (vision + harder reasoning).

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Measurement, PriceBookItem, ProposalLineItemInput } from '@roofops/types';
import type { Env } from '../../env.js';

const ToolLineItemSchema = z.object({
  priceBookItemId: z.string().uuid().nullable().optional(),
  kind: z.enum(['MATERIAL', 'LABOR', 'FEE']),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  unit: z.string().min(1).max(50),
  quantity: z.number().nonnegative(),
  unitCostCents: z.number().int().nonnegative(),
  markupBps: z.number().int().min(0).max(50_000),
  wasteFactorBps: z.number().int().min(0).max(10_000),
  reviewNote: z.string().max(500).optional(),
});

const ToolOutputSchema = z.object({
  title: z.string().min(1).max(200),
  scopeOfWork: z.string().max(20_000),
  lineItems: z.array(ToolLineItemSchema).min(1).max(60),
  termsAdditions: z.string().max(10_000).optional(),
  reviewNotes: z.array(z.string().max(500)).max(20).default([]),
  confidence: z.number().int().min(0).max(100),
});

export type ToolOutput = z.infer<typeof ToolOutputSchema>;

export interface ProposalGenerationContext {
  jobType: string;
  scopeHints: string | undefined;
  contact: { name: string; email: string | null; phone: string | null };
  measurements: Measurement[];
  priceBook: PriceBookItem[];
  hasBlueprintAssets: boolean;
  orgName: string;
}

export interface GeneratedProposal {
  title: string;
  scopeOfWork: string;
  lineItems: ProposalLineItemInput[];
  termsAdditions: string;
  reviewNotes: string[];
  confidence: number;
  modelUsed: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

const SUBMIT_PROPOSAL_TOOL: Anthropic.Tool = {
  name: 'submit_proposal',
  description:
    'Submit a draft roofing proposal. Always emit at least one MATERIAL and one LABOR line item. ' +
    'Use waste factors typical for the material (shingles 10-15%, underlayment 5%, etc.). ' +
    'Reference price-book items by priceBookItemId whenever the price book contains a match — ' +
    'use a null priceBookItemId only for items that genuinely have no match. ' +
    'Add a `reviewNote` to any line item the human estimator should double-check ' +
    '(unusual quantities, low-confidence measurements, missing price-book match).',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'scopeOfWork', 'lineItems', 'reviewNotes', 'confidence'],
    properties: {
      title: { type: 'string', maxLength: 200 },
      scopeOfWork: {
        type: 'string',
        maxLength: 20_000,
        description: 'Customer-facing scope paragraph(s). Avoid hedging language.',
      },
      lineItems: {
        type: 'array',
        minItems: 1,
        maxItems: 60,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'kind',
            'name',
            'unit',
            'quantity',
            'unitCostCents',
            'markupBps',
            'wasteFactorBps',
          ],
          properties: {
            priceBookItemId: { type: ['string', 'null'], format: 'uuid' },
            kind: { type: 'string', enum: ['MATERIAL', 'LABOR', 'FEE'] },
            name: { type: 'string', maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            unit: { type: 'string', maxLength: 50 },
            quantity: { type: 'number', minimum: 0 },
            unitCostCents: { type: 'integer', minimum: 0 },
            markupBps: { type: 'integer', minimum: 0, maximum: 50_000 },
            wasteFactorBps: { type: 'integer', minimum: 0, maximum: 10_000 },
            reviewNote: { type: 'string', maxLength: 500 },
          },
        },
      },
      termsAdditions: { type: 'string', maxLength: 10_000 },
      reviewNotes: {
        type: 'array',
        items: { type: 'string', maxLength: 500 },
        maxItems: 20,
        description:
          'Top-level concerns the human reviewer should address before sending. ' +
          'Cover missing context, low-confidence measurements, items added that aren\'t in the price book.',
      },
      confidence: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description:
          'Overall confidence that this proposal can be sent with minimal edits. ' +
          'Anything under 70 will be flagged in the UI.',
      },
    },
  },
};

function buildSystemPrompt(orgName: string): string {
  return [
    `You are an experienced roofing estimator drafting a proposal for ${orgName}.`,
    'Always submit your output via the `submit_proposal` tool — never reply with prose only.',
    'Be precise about measurements and waste factors. Cite the customer\'s actual numbers where possible.',
    'Never invent measurements that are not given. If a measurement is missing, omit dependent line items and add a reviewNote.',
    'Recommend safe defaults for waste factors when the customer or estimator did not provide one.',
    'Be honest about confidence — overconfident proposals waste the estimator\'s time on rework.',
  ].join(' ');
}

function formatPriceBookForCache(items: PriceBookItem[]): string {
  if (items.length === 0) {
    return 'PRICE BOOK\n(empty — estimator will need to add items manually)';
  }
  const lines = ['PRICE BOOK', 'id | kind | name | unit | unitCostCents | markupBps | wasteFactorBps'];
  for (const item of items) {
    lines.push(
      [item.id, item.kind, item.name.replace(/\|/g, '/'), item.unit, item.unitCostCents, item.markupBps, item.wasteFactorBps].join(
        ' | ',
      ),
    );
  }
  return lines.join('\n');
}

function formatMeasurements(measurements: Measurement[]): string {
  if (measurements.length === 0) {
    return 'MEASUREMENTS: none on file.';
  }
  return [
    'MEASUREMENTS',
    ...measurements.map(
      (m) =>
        `- ${m.label} = ${m.value} ${m.unit} (method=${m.method}, confidence=${m.confidence}%)`,
    ),
  ].join('\n');
}

export class ProposalGenerator {
  private client: Anthropic | null = null;

  constructor(private readonly env: Env) {}

  private getClient(): Anthropic {
    if (!this.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return !!this.env.ANTHROPIC_API_KEY;
  }

  async generate(ctx: ProposalGenerationContext): Promise<GeneratedProposal> {
    const client = this.getClient();

    // Sonnet 4.6 is the routine path; Opus 4.7 handles blueprint vision /
    // harder geometry per the PRD. Adaptive thinking suits the long-tail
    // edge cases without paying a thinking premium on simple jobs.
    const model = ctx.hasBlueprintAssets ? 'claude-opus-4-7' : this.env.ANTHROPIC_MODEL;

    const system = [
      { type: 'text' as const, text: buildSystemPrompt(ctx.orgName) },
      // Price-book block is the largest stable input across many
      // generations for the same org — cache it so subsequent proposals
      // pay ~0.1x for these tokens.
      {
        type: 'text' as const,
        text: formatPriceBookForCache(ctx.priceBook),
        cache_control: { type: 'ephemeral' as const },
      },
    ];

    const userText = [
      `Job type: ${ctx.jobType}`,
      ctx.scopeHints ? `Scope notes: ${ctx.scopeHints}` : '',
      '',
      `Customer: ${ctx.contact.name}`,
      ctx.contact.email ? `Email: ${ctx.contact.email}` : '',
      ctx.contact.phone ? `Phone: ${ctx.contact.phone}` : '',
      '',
      formatMeasurements(ctx.measurements),
      '',
      'Generate the proposal now via submit_proposal. Refer to price-book ids when possible.',
    ]
      .filter((line) => line.length > 0 || line === '')
      .join('\n');

    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: userText }],
      tools: [SUBMIT_PROPOSAL_TOOL],
      tool_choice: { type: 'tool', name: 'submit_proposal' },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'submit_proposal',
    );
    if (!toolUse) {
      throw new Error(`AI did not invoke submit_proposal (stop_reason=${response.stop_reason})`);
    }

    const parsed = ToolOutputSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new Error(
        `AI proposal failed validation: ${parsed.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ')}`,
      );
    }
    const data = parsed.data;

    const reviewNotes: string[] = [...data.reviewNotes];
    const lineItems: ProposalLineItemInput[] = data.lineItems.map((li) => {
      if (li.reviewNote) {
        reviewNotes.push(`${li.name}: ${li.reviewNote}`);
      }
      return {
        kind: li.kind,
        name: li.name,
        description: li.description,
        unit: li.unit,
        quantity: li.quantity,
        unitCostCents: li.unitCostCents,
        markupBps: li.markupBps,
        wasteFactorBps: li.wasteFactorBps,
        ...(li.priceBookItemId ? { priceBookItemId: li.priceBookItemId } : {}),
      };
    });

    return {
      title: data.title,
      scopeOfWork: data.scopeOfWork,
      lineItems,
      termsAdditions: data.termsAdditions ?? '',
      reviewNotes,
      confidence: data.confidence,
      modelUsed: model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

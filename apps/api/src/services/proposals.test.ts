import { describe, expect, it } from 'vitest';
import { computeLineItemSubtotalCents } from './proposals.js';

describe('computeLineItemSubtotalCents', () => {
  it('computes a clean integer subtotal with no waste or markup', () => {
    expect(
      computeLineItemSubtotalCents({
        kind: 'MATERIAL',
        name: 'Test',
        unit: 'each',
        quantity: 10,
        unitCostCents: 12_500,
        markupBps: 0,
        wasteFactorBps: 0,
      }),
    ).toBe(125_000n);
  });

  it('applies the 30% default markup', () => {
    // 10 units * $125.00 * 1.30 = $1625.00
    expect(
      computeLineItemSubtotalCents({
        kind: 'MATERIAL',
        name: 'Test',
        unit: 'each',
        quantity: 10,
        unitCostCents: 12_500,
        markupBps: 3000,
        wasteFactorBps: 0,
      }),
    ).toBe(162_500n);
  });

  it('applies waste factor + markup compounded', () => {
    // 2400 sqft * $1.20 * 1.10 (waste) * 1.30 (markup) = $4118.40 -> 411840 cents
    expect(
      computeLineItemSubtotalCents({
        kind: 'MATERIAL',
        name: 'Shingles 30yr',
        unit: 'sqft',
        quantity: 2400,
        unitCostCents: 120,
        markupBps: 3000,
        wasteFactorBps: 1000,
      }),
    ).toBe(411_840n);
  });

  it('handles fractional quantities without precision drift', () => {
    // 23.5 squares * $42500 * 1.10 * 1.30 = $1,427,222.50 -> 142,722,250 cents
    // (rounded to nearest cent)
    const result = computeLineItemSubtotalCents({
      kind: 'MATERIAL',
      name: 'Shingles',
      unit: 'squares',
      quantity: 23.5,
      unitCostCents: 42_500,
      markupBps: 3000,
      wasteFactorBps: 1000,
    });
    // Tolerate 1-cent rounding either way from the banker's-rounding step.
    expect(result).toBeGreaterThanOrEqual(142_722_249n);
    expect(result).toBeLessThanOrEqual(142_722_251n);
  });

  it('returns 0 for zero quantity', () => {
    expect(
      computeLineItemSubtotalCents({
        kind: 'LABOR',
        name: 'Test',
        unit: 'hr',
        quantity: 0,
        unitCostCents: 50_000,
        markupBps: 5000,
        wasteFactorBps: 0,
      }),
    ).toBe(0n);
  });
});

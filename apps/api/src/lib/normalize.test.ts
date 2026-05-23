import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePhone } from './normalize.js';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com');
  });
  it('returns null for empty input', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('handles US 10-digit numbers', () => {
    expect(normalizePhone('(415) 555-2671')).toBe('+14155552671');
  });
  it('handles US 11-digit numbers with leading 1', () => {
    expect(normalizePhone('1-415-555-2671')).toBe('+14155552671');
  });
  it('preserves explicit + prefix for non-US', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });
  it('falls back to digits-only when length is unusual', () => {
    expect(normalizePhone('555-1234')).toBe('5551234');
  });
  it('returns null for empty input', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('---')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { generateOpaqueToken, hashToken } from './tokens.js';

describe('opaque tokens', () => {
  it('generates URL-safe tokens of the expected length', () => {
    const token = generateOpaqueToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('produces unique tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
  });

  it('hashes deterministically and irreversibly', () => {
    const token = 'fixed-input-value';
    const h1 = hashToken(token);
    const h2 = hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).not.toContain(token);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });
});

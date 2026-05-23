import { randomBytes, createHash } from 'node:crypto';

export function generateOpaqueToken(byteLength = 48): string {
  return randomBytes(byteLength).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

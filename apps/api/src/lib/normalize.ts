// Normalize values into the canonical forms used for dedup lookups.

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

// Best-effort E.164 conversion: strip everything that isn't a digit, prefix
// the country code "+" if there's an obvious 10-digit US/CA number. Anything
// else is preserved as digits-only so dedup still works within an org.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return input.startsWith('+') ? `+${digits}` : digits;
}

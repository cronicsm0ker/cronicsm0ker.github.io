// Money helpers. All API money is BigInt cents serialized as strings —
// keep the formatting + parsing tight so we don't lose precision crossing
// the wire.

export function formatCents(cents: string | number | bigint): string {
  const n = typeof cents === 'string' ? Number(cents) : Number(cents);
  if (Number.isNaN(n)) return String(cents);
  return `$${(n / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

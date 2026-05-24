const ONE_MINUTE = 60_000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < ONE_MINUTE) return 'just now';
  if (diff < ONE_HOUR) return `${Math.floor(diff / ONE_MINUTE)}m ago`;
  if (diff < ONE_DAY) return `${Math.floor(diff / ONE_HOUR)}h ago`;
  if (diff < 7 * ONE_DAY) return `${Math.floor(diff / ONE_DAY)}d ago`;
  return date.toLocaleDateString();
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

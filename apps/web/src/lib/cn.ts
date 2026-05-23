type ClassValue = string | number | boolean | null | undefined | ClassValue[];

export function cn(...args: ClassValue[]): string {
  const parts: string[] = [];
  for (const arg of args) {
    if (!arg) continue;
    if (typeof arg === 'string' || typeof arg === 'number') {
      parts.push(String(arg));
    } else if (Array.isArray(arg)) {
      const nested = cn(...arg);
      if (nested) parts.push(nested);
    }
  }
  return parts.join(' ');
}

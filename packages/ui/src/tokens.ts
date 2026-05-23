// Shared design tokens. Web consumes via Tailwind theme extension;
// mobile imports the same values directly. Keep this list minimal until
// real component work begins in Phase 1.

export const colors = {
  brand: {
    50: '#fff7ed',
    100: '#ffedd5',
    500: '#f97316',
    600: '#ea580c',
    700: '#c2410c',
    900: '#7c2d12',
  },
  neutral: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    400: '#94a3b8',
    600: '#475569',
    800: '#1e293b',
    900: '#0f172a',
  },
  status: {
    success: '#16a34a',
    warning: '#eab308',
    danger: '#dc2626',
    info: '#0284c7',
  },
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const;

export type ColorScale = keyof typeof colors;
export type Radius = keyof typeof radius;
export type Spacing = keyof typeof spacing;

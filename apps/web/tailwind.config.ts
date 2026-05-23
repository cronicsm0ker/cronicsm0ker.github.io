import type { Config } from 'tailwindcss';
import { colors as tokenColors, radius, spacing } from '@roofops/ui/tokens';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: tokenColors.brand,
        neutral: tokenColors.neutral,
        success: tokenColors.status.success,
        warning: tokenColors.status.warning,
        danger: tokenColors.status.danger,
        info: tokenColors.status.info,
      },
      borderRadius: {
        sm: `${radius.sm}px`,
        DEFAULT: `${radius.md}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
      },
      spacing: {
        xs: `${spacing.xs}px`,
        sm: `${spacing.sm}px`,
        md: `${spacing.md}px`,
        lg: `${spacing.lg}px`,
        xl: `${spacing.xl}px`,
        '2xl': `${spacing['2xl']}px`,
      },
    },
  },
  plugins: [],
};

export default config;

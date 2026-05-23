import react from '@roofops/config/eslint/react';

export default [
  ...react,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['dist', '.expo', '.turbo'],
  },
];

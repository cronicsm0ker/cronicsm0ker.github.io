import react from '@roofops/config/eslint/react';

export default [
  ...react,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['src/routeTree.gen.ts', 'dist', '.turbo'],
  },
];

# RoofOps

Operations platform for roofing and general construction contractors. Covers the full commercial lifecycle: lead capture → unified inbox → AI-assisted proposals → contracts → work orders → dispatch → invoicing → Stripe payments → job closeout.

The current phase is **Phase 0 — Foundations**. See `docs/prd.md` for the full product requirements document and `docs/plans/phase-0.md` for the execution plan.

## Repository layout

```
apps/
  api/          Fastify backend (TypeScript)
  web/          React + Vite admin/back-office app
  mobile/       Expo React Native app (field/sales/owner)
packages/
  db/           Prisma schema + generated client
  types/        Shared Zod schemas + inferred TS types (source of truth)
  api-client/   Typed fetch client used by web and mobile
  ui/           Shared design tokens and primitive components
  config/       Shared ESLint, Prettier, TSConfig presets
docs/
  prd.md        Product requirements document
  plans/        Execution plans per phase
```

## Prerequisites

- Node 22 LTS (`nvm use` will pick up `.nvmrc`)
- pnpm 9+
- A local Postgres 16 instance (or a managed one — see `docs/plans/phase-0.md`)

## Getting started

```bash
pnpm install
pnpm db:generate
pnpm dev
```

## Scripts

- `pnpm build` — build every workspace
- `pnpm dev` — run every dev server (API, web, mobile) in parallel
- `pnpm lint` — lint everything
- `pnpm typecheck` — strict TypeScript across the monorepo
- `pnpm test` — run unit tests
- `pnpm db:migrate` — apply Prisma migrations
- `pnpm db:studio` — open Prisma Studio

## License

Proprietary — all rights reserved.

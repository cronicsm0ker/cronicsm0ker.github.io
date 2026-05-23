# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

RoofOps — a TypeScript monorepo for a roofing/contractor operations platform. See `docs/prd.md` for the full PRD and `docs/plans/phase-0.md` for what we're currently building.

## Layout

- `apps/api` — Fastify backend (Node 22, TypeScript strict)
- `apps/web` — React 19 + Vite admin app
- `apps/mobile` — Expo React Native app
- `packages/db` — Prisma schema + generated client (`@roofops/db`)
- `packages/types` — Zod schemas + inferred TS types (`@roofops/types`) — **source of truth for cross-app contracts**
- `packages/api-client` — typed fetch client used by web and mobile (`@roofops/api-client`)
- `packages/ui` — shared design tokens (`@roofops/ui`)
- `packages/config` — shared ESLint flat config + TSConfig presets (`@roofops/config`)

## Conventions

- TypeScript strict mode everywhere. `verbatimModuleSyntax: true`, so use `import type` for type-only imports.
- All shared API request/response shapes live in `packages/types` as Zod schemas. Handlers and clients import from there; nothing duplicates these shapes.
- Money in cents as BigInt. Timestamps UTC in DB; format client-side.
- Every tenant-scoped table carries `org_id`. **Queries must filter on `org_id` from the JWT claim, never from the request body.** The `/me` route is the canonical pattern.
- DB columns are `snake_case` (Prisma `@map`); TS field names are `camelCase`.
- Soft delete via `deleted_at` for customer-facing records.

## Commands

- `pnpm install` — install everything
- `pnpm db:generate` — regenerate Prisma client (run after schema changes)
- `pnpm db:migrate` — apply migrations
- `pnpm dev` — run every dev server in parallel via Turbo
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` — Turbo pipelines

## When adding a new tenant-scoped feature

1. Add the Zod schemas to `packages/types`.
2. Add the Prisma model with `org_id` + `(org_id, id)` index to `packages/db/prisma/schema.prisma`.
3. Generate migration: `pnpm --filter @roofops/db exec prisma migrate dev --name <feature>`.
4. Add routes in `apps/api/src/routes/` that derive `org_id` from the JWT claim — never trust request body for it.
5. Add `@roofops/api-client` methods consuming the same schemas.
6. Add the web route and mobile screen.

## Deployment

- API runs on a self-hosted Linux VPS behind Nginx, managed by PM2 — see `docs/deploy-self-host.md`. Bootstrap with `scripts/server/bootstrap.sh`, deploy with `scripts/server/deploy.sh`.
- Web ships as a static Vite build to Cloudflare Pages (or co-located on the same VPS — see the deploy doc).
- Mobile via Expo Go in Phase 0; EAS internal distribution from Phase 1.

## Phase 0 deviations (active until Phase 1 starts)

- Password reset emails log to console; wire Resend/Postmark in Phase 1.
- OTel exporter is console; OTLP collector in Phase 1.

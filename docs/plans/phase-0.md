# Phase 0 — Foundations

**Goal:** the repo, infra, and conventions are in place so every later phase plugs in cleanly. Target duration: 2 weeks (solo engineer).

**Review checkpoint:** developer signs in on web and mobile against staging, hits a protected endpoint, sees Pino logs flow and a Sentry event captured from a forced 500.

## Recommended deviations from the PRD (for Phase 0 only)

| PRD says | Phase 0 ships | Why |
|---|---|---|
| API on VPS via PM2 + Nginx | Same — automated via `scripts/server/bootstrap.sh` and `scripts/server/deploy.sh` | Matches the PRD; see `docs/deploy-self-host.md`. |
| Password reset functional end-to-end | Endpoints + DB tokens; email send stubbed to console | No email provider yet. Wire Resend/Postmark in Phase 1. |
| Expo app via EAS internal distribution | Login screen wired through shared `api-client`; run via Expo Go | EAS pipeline = half a day of yak shave. Defer. |
| OpenTelemetry traces exported | SDK initialized with console exporter | OTLP collector setup is Phase 1. Init pattern locks in now. |
| First migration: User, Org, Role | + `Membership`, `RefreshToken`, `PasswordResetToken`, stub `Contact(org_id, ...)` | Multi-tenancy canary — locks the `org_id` pattern in from day one. |

## Repo-wipe sequence

1. ✅ Push current `main` (grammar portfolio HTML) to `legacy/grammar-portfolio` branch as in-repo backup.
2. ⏳ **User action required:** Disable GitHub Pages (repo Settings → Pages → Source: None) so https://cronicsm0ker.github.io stops serving stale content.
3. ⏳ **User action (optional):** Create `cronicsm0ker/grammar-portfolio` repo and push the legacy branch there for an external archive. Not blocking.
4. Build RoofOps monorepo on `claude/roofops-prd-review-XZ8FT`, open PR, review, merge to `main`.

The repo is **not renamed** — `*.github.io` is harmless once Pages is off and renaming breaks remotes.

## External accounts to create (one sitting before deploys)

- **Railway** — project with two envs (`dev`, `staging`). Add Postgres 16 + Redis 7. Capture `DATABASE_URL`, `REDIS_URL`, deploy token.
- **Cloudflare** — Pages project connected to this repo.
- **Sentry** — org + projects `roofops-api` and `roofops-web`. Capture DSNs.
- **Expo / EAS** — account creation only.
- **GitHub** — add `RAILWAY_TOKEN`, `SENTRY_AUTH_TOKEN`, Cloudflare token (if not using Pages git integration) to repo Actions secrets.

**Deferred to Phases 1–3:** Anthropic, Stripe, S3, WhatsApp, Twilio, Postmark, DocuSeal.

## Build sequence

### Step 1 — Monorepo skeleton (Day 1) ✅ in progress
Root files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.editorconfig`, `.gitignore`, `.nvmrc`, `.prettierrc.json`). Workspaces under `apps/{api,web,mobile}` and `packages/{db,types,api-client,ui,config}`.

### Step 2 — `packages/db` + first migration (Day 2)
`packages/db/prisma/schema.prisma`:
- `User(id, email unique, password_hash, created_at)`
- `Org(id, name, created_at)`
- `Membership(user_id, org_id, role enum {OWNER, ADMIN, MEMBER})` — composite PK
- `RefreshToken(id, user_id, token_hash, expires_at, revoked_at)`
- `PasswordResetToken(id, user_id, token_hash, expires_at, used_at)`
- `Contact(id, org_id NOT NULL, name, email, phone, created_at)` — multi-tenancy canary

Indexes on every `org_id`; composite `(org_id, id)` on `Contact`.

**Depends on:** Railway Postgres provisioned, `DATABASE_URL` set.

### Step 3 — `packages/types` + `packages/api-client` (Day 2, parallel)
`packages/types` — Zod schemas for `LoginRequest`, `LoginResponse`, `RefreshRequest`, `User`, `Org`, `Membership`, `ApiError`. **Defined before any handler or screen.**

`packages/api-client` — fetch-based client (`login`, `refresh`, `me`) with pluggable token storage (web: `localStorage`; mobile: `expo-secure-store`). Silent refresh on 401.

### Step 4 — `apps/api` Fastify foundation (Days 3–5)
Routes: `GET /health`, `POST /auth/{register,login,refresh,logout,forgot,reset}`, `GET /me` (protected).

Specifics: Argon2id, JWT access 15m + refresh 30d rotated and hashed-at-rest, RBAC preHandlers, `org_id` from JWT claim never request body, Sentry init (no-op if DSN absent), OTel SDK with console exporter, stubbed `EmailProvider` that logs reset URLs.

Dockerfile for Railway deploy.

**Depends on:** Step 2 + Step 3.

### Step 5 — `apps/web` Vite shell (Days 6–7)
Vite + React 19 + TanStack Router + TanStack Query + Tailwind + shadcn/ui. Routes: `/login`, `/`, `/forgot`, `/reset/:token`. Zustand auth store (access in memory, refresh in `localStorage`). Cloudflare Pages auto-deploys on push to `main`.

**Depends on:** Step 4 deployed to staging.

### Step 6 — `apps/mobile` Expo shell (Day 8)
Managed Expo + React Navigation + two screens (`Login`, `Home`). Uses `packages/api-client` with `expo-secure-store` adapter. Run via Expo Go pointed at staging for the checkpoint.

**Depends on:** Step 4 deployed, `packages/api-client` stable.

### Step 7 — CI (Day 9, parallel)
- `ci.yml`: `pnpm install --frozen-lockfile`, `turbo run typecheck lint test`, `prisma migrate diff` drift check, build all apps.
- `deploy-api.yml`: on push to `main`, Railway deploy via CLI + token.
- Web: Cloudflare Pages git integration (no workflow needed).

### Step 8 — Buffer + review checkpoint (Days 10–12)
End-to-end smoke:
1. Sign in on web (Cloudflare Pages URL) → `GET /me` → see Pino log in Railway with request-id.
2. Sign in on mobile (Expo Go pointed at staging) → `GET /me`.
3. Force a 500 → confirm Sentry capture.
4. Forgot-password → console-logged reset URL completes the reset round-trip.

## Critical sequencing rules

- `packages/types` defined before any API handler or screen imports auth shapes.
- `packages/db` migration applied to Railway Postgres before first API deploy.
- `JWT_SECRET`, `DATABASE_URL`, `SENTRY_DSN` in Railway env before first deploy.
- `org_id` enforcement pattern (JWT claim → query filter) established in `/me` as the template for Phase 1.

## Slips to early Phase 1

- VPS + PM2 + Nginx migration.
- EAS internal-distribution pipeline.
- Real email provider (Resend/Postmark).
- OTel OTLP exporter + collector.

## Acceptance

- `pnpm install && pnpm turbo run typecheck lint test build` green from a fresh clone.
- `prisma migrate deploy` clean against fresh Postgres.
- CI green on a no-op PR.
- Sentry has ≥ 1 captured event from `roofops-api` and `roofops-web`.
- `docs/prd.md` lives in the tree.

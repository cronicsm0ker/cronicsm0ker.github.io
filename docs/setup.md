# RoofOps — Local & Staging Setup

This is the bootstrap checklist for taking the Phase 0 monorepo from a fresh clone to "I can sign in on web and mobile against staging." Follow top to bottom.

## 1. Prerequisites on your machine

- Node 22 LTS (`nvm install 22 && nvm use`)
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker (only needed if you want a local Postgres/Redis without managed services)
- For mobile: Expo Go app on a phone (iOS App Store / Android Play Store)

## 2. Install workspace dependencies

```bash
pnpm install
```

This installs every workspace and generates the Prisma client (postinstall hooks).

## 3. External accounts to create

Do these in one sitting before you start coding so credentials are ready when you need them.

### Railway (API + Postgres + Redis)
1. Create account at https://railway.com.
2. Create a project called `roofops`.
3. Add a **PostgreSQL 16** plugin. Copy `DATABASE_URL`.
4. Add a **Redis 7** plugin (not used in Phase 0 but reserved). Copy `REDIS_URL`.
5. Create a service from this GitHub repo, root directory `/`, Dockerfile path `apps/api/Dockerfile`. Railway will read `apps/api/railway.json` for build + start config.
6. Create environments `dev` and `staging`. Per-environment vars:
   - `JWT_SECRET` — generate with `openssl rand -base64 48`
   - `DATABASE_URL`, `REDIS_URL` (auto-populated from plugins)
   - `SENTRY_DSN` (from step below)
   - `APP_WEB_URL` — your Cloudflare Pages URL
   - `CORS_ORIGINS` — comma-separated, e.g. `https://roofops.pages.dev`
   - `NODE_ENV=production`

### Cloudflare Pages (web)
1. Create account at https://dash.cloudflare.com.
2. Pages → Create application → Connect to Git → select this repo.
3. Build settings:
   - Build command: `pnpm install --frozen-lockfile && pnpm --filter @roofops/web build`
   - Build output directory: `apps/web/dist`
   - Root directory: `/`
   - Environment variable: `VITE_API_URL` = your Railway API URL
4. Cloudflare auto-deploys on push to `main`.

### Sentry (observability)
1. Create account at https://sentry.io.
2. Create org `roofops`. Add two projects: `roofops-api` (Node), `roofops-web` (React).
3. Copy each DSN into the matching env var (`SENTRY_DSN` on Railway, `VITE_SENTRY_DSN` on Cloudflare — wiring web Sentry is a Phase 0 nice-to-have, currently unused).

### Expo / EAS (mobile)
1. Create account at https://expo.dev.
2. `npx eas-cli@latest login` from `apps/mobile/`.
3. `eas init` to link the project (writes `slug` into `app.json`).
4. Phase 0 ships with Expo Go testing only; EAS internal distribution is Phase 1.

### GitHub Actions secrets
Add the following at Settings → Secrets and variables → Actions:
- `RAILWAY_TOKEN` (Railway → Account → Tokens)
- `SENTRY_AUTH_TOKEN` (Sentry → Settings → Auth Tokens, scope `project:releases`)

## 4. Local development (no managed services required)

If you'd rather develop entirely locally before standing up Railway:

```bash
# 1. Start Postgres + Redis in Docker
docker run -d --name roofops-pg -p 5432:5432 \
  -e POSTGRES_USER=roofops -e POSTGRES_PASSWORD=roofops -e POSTGRES_DB=roofops_dev \
  postgres:16-alpine
docker run -d --name roofops-redis -p 6379:6379 redis:7-alpine

# 2. Create local env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit apps/api/.env: set JWT_SECRET to anything ≥ 32 chars

# 3. Apply migrations + generate Prisma client
pnpm db:generate
pnpm db:migrate

# 4. Run everything
pnpm dev
```

The Turbo pipeline starts the API on `:3000`, web on `:5173`, and the Expo dev server.

## 5. Mobile against local API

In `apps/mobile/app.json`, update `extra.apiUrl` to your machine's LAN IP (Expo Go on a phone can't reach `localhost`):

```json
"extra": { "apiUrl": "http://192.168.1.42:3000" }
```

Then `pnpm --filter @roofops/mobile start` and scan the QR code.

## 6. Phase 0 review checkpoint

Per `docs/plans/phase-0.md`, you're done when:

- [ ] Web sign-in succeeds against staging → `/me` returns the session.
- [ ] Mobile sign-in via Expo Go succeeds against staging.
- [ ] A forced 500 captures in Sentry (`roofops-api`).
- [ ] `POST /auth/forgot` logs a reset URL; pasting it into `/reset/:token` resets the password.
- [ ] CI is green on `main`.

## 7. Pre-launch cleanup

Before the wipe-`main`-with-the-monorepo step lands publicly:

1. **Disable GitHub Pages** on this repo (Settings → Pages → Source: None) so the old grammar-portfolio HTML stops serving.
2. The legacy site is preserved on branch `legacy/grammar-portfolio`.
3. Open the PR from `claude/roofops-prd-review-XZ8FT` to `main`, review, and merge.

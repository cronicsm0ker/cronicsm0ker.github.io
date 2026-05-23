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

### Self-hosted VPS (API + Postgres + Redis)
Follow `docs/deploy-self-host.md` for the full server bootstrap. In short:

1. Provision a Debian 12 or Ubuntu 24.04 host (1–2 vCPU, 2–4 GB RAM is enough for Phase 0).
2. Point an A record (e.g. `api.example.com`) at the host.
3. SSH in, clone the repo, run `sudo ROOFOPS_DOMAIN=api.example.com bash scripts/server/bootstrap.sh`.
4. Issue TLS: `sudo certbot --nginx -d api.example.com --redirect --agree-tos -m you@example.com`.
5. First deploy: `sudo -iu roofops bash ~/app/scripts/server/deploy.sh`.

The bootstrap installs Node 22, pnpm, PM2, Postgres 16, Redis, Nginx, certbot, ufw, and fail2ban; provisions the Postgres role/database; and writes `/etc/roofops/api.env` with a generated `JWT_SECRET` and DB URL. Edit that file to fill in `APP_WEB_URL`, `CORS_ORIGINS`, and `SENTRY_DSN`, then `pm2 reload roofops-api --update-env`.

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

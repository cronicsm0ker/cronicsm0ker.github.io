# syntax=docker/dockerfile:1.6
#
# Builds the @roofops/api workspace and its workspace dependencies, then
# produces a slim runtime image. Designed for Railway / Fly / any Docker host.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /repo

# ---- deps: install full workspace, resolving lockfile from repo root ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/ui/package.json ./packages/ui/
COPY packages/config/package.json ./packages/config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- build: compile API + its workspace deps ----
FROM deps AS build
COPY . .
RUN pnpm --filter @roofops/db exec prisma generate \
  && pnpm --filter @roofops/api... build

# ---- runtime: prune to production-only deps ----
FROM base AS prod-deps
COPY --from=build /repo /repo
RUN pnpm --filter @roofops/api... --prod deploy /out

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /out/node_modules ./node_modules
COPY --from=prod-deps /out/dist ./dist
COPY --from=prod-deps /out/package.json ./package.json
COPY --from=build /repo/packages/db/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/server.js"]

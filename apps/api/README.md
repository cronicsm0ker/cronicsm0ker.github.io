# @roofops/api

Fastify backend for RoofOps. See `docs/plans/phase-0.md` Step 4 for what lands here in Phase 0:

- Health check, structured logging, error handler, Zod env loader
- Auth (register/login/refresh/logout/forgot/reset) + JWT + Argon2id
- Prisma client integration
- Sentry + OTel (console exporter in Phase 0)
- Dockerfile for Railway deploy

Implementation begins in the next commit after the monorepo skeleton lands.

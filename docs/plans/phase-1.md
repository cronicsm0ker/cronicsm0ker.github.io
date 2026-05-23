# Phase 1 — Lead capture and unified inbox

**Goal:** every lead and every customer message lands in RoofOps. Target duration: 4 weeks (PRD §9, Phase 1).

**Review checkpoint:** a lead from a Meta ad arrives → the rep replies via WhatsApp from the mobile app → the full thread is visible on web with SLA timing recorded.

## Scope (per PRD §6.1 + §6.2)

- Domain: Contact, Lead, Activity, MessageThread, Message, AuditLog
- Lead pipeline UI (web kanban + table) with stage transitions, owner assignment, SLA timer
- Mobile lead list + lead detail + status change + quick reply
- Inbound channel adapters: web form, Meta Lead Ads, Google Ads, WhatsApp Cloud API, Twilio SMS, Postmark inbound email, Telegram bot, iMessage gateway
- Outbound replies on all channels
- Unified inbox UI (web + mobile)
- Deduplication on phone + email; contact merge
- Audit log baseline (every write captured)
- Org-scoped row-level access enforced at the service layer

## Build sequence (chunks; each chunk = a commit)

### Chunk 1 — Domain layer (this turn)
- Prisma schema extensions: `Lead`, `LeadStage`, `LeadSource`, `Activity`, `ActivityKind`, `MessageThread`, `Message`, `MessageDirection`, `MessageChannel`, `AuditLog`. Expand `Contact` with `ownerId`, dedup-friendly normalized fields.
- Migration `phase1_leads_and_messaging`.
- `@roofops/types` Zod schemas for all new entities and request/response contracts.
- `packages/db` query helpers that enforce `org_id` at every call site.
- API service layer for Contacts, Leads, Activities, Threads, Messages — services take the `AuthContext` (orgId, userId, role) explicitly.
- Audit log helper that writes one row per state change.

### Chunk 2 — REST API surface
- Routes under `/contacts`, `/leads`, `/activities`, `/threads`, `/messages` — all behind `requireAuth`, all derive `org_id` from JWT, never request body.
- Stage transition endpoint with allowed-transition matrix and SLA stamping.
- Dedup-on-create for contacts.
- Contact merge endpoint.

### Chunk 3 — Channel adapters: ingress
- Webhook router under `/webhooks/<provider>/<orgId>` with HMAC verification per provider.
- Reference adapter: **public web form** (`POST /public/leads/web-form?token=...`) — simplest, no provider-side auth.
- Meta Lead Ads, Google Ads, WhatsApp Cloud API, Twilio SMS, Postmark inbound, Telegram bot, iMessage gateway — one file each under `apps/api/src/channels/`.
- Each adapter normalizes to `LeadIngest` shape and calls `LeadService.ingest`.

### Chunk 4 — Outbound messaging
- `MessageService.send` with per-channel transport.
- Provider keys stored encrypted in `ChannelCredential(org_id, channel, secret)` table.
- WhatsApp template-message support (HSM); freeform within 24h window.

### Chunk 5 — Web UI: lead pipeline + inbox
- Routes: `/leads` (kanban + table toggle), `/leads/:id`, `/inbox`, `/inbox/:threadId`, `/contacts`.
- SLA timer component.
- Optimistic stage transitions.

### Chunk 6 — Mobile UI
- Tabs: Leads, Inbox, Profile.
- Lead list with pull-to-refresh; lead detail with stage + assign + quick-reply composer.
- Background sync for new messages via TanStack Query polling (Expo push notifications in Phase 4).

### Chunk 7 — Audit + dedup tests + e2e checkpoint
- Vitest contract tests against the channel-adapter normalization.
- Cypress/Playwright happy-path: ad lead → reply → thread visible.

## Acceptance

- All inbound channels create a Lead + Activity within 5s of webhook receipt (measured).
- Reply sent from mobile or web propagates to the channel within 5s.
- Two ad submissions with the same phone collapse into one Contact + one Lead.
- AuditLog has one row per state-changing API call.
- Org-isolation test: a user from Org A cannot read or write anything belonging to Org B (covered by automated test).

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

### Chunk 1 — Domain layer ✅
Schema, migration, types, services, audit logger landed.

### Chunk 2 — REST API surface ✅
`/contacts`, `/leads`, `/threads`, `/messages` + stage transition with matrix + dedup + merge.

### Chunk 3 — Channel adapters (ingress) ✅
Web form (reference), Twilio SMS, WhatsApp Cloud API, Meta Lead Ads (notification only — Graph fetch deferred), Postmark email, Telegram. Signature verification helpers + Vitest coverage.

### Chunk 4 — Outbound messaging ✅
MessageTransport implementations for SMS, WhatsApp, Email, Telegram registered via `transportsPlugin`. iMessage gateway pending vendor choice; web-form has no outbound.

### Chunk 5 — Web UI: lead pipeline + inbox ✅
Protected `_app` layout with sidebar nav; Dashboard / Leads (filterable table) / Lead detail (stage + activity) / Inbox / Thread (chat bubbles + composer + 8s poll).

### Chunk 6 — Mobile UI ✅
Bottom tabs (Leads / Inbox / Profile), pull-to-refresh lists, lead detail with stage buttons, thread detail with composer.

### Chunk 7 — Tests + e2e checkpoint ✅
Vitest org-isolation test (`apps/api/src/services/__tests__/org-isolation.test.ts`) covering read, list, stage, assign, and dedup scoping. Manual smoke checklist in `docs/phase-1-smoke.md`. Playwright slips to Phase 4 hardening since the UI surface is still volatile.

## What slipped to later phases

- **Meta Lead Ads Graph fetch**: webhook accepts the notification and stores the `leadgen_id`; a background job (Phase 2 BullMQ) fetches the form data and enriches the Contact.
- **Email provider for password reset / lead notifications**: still console-stubbed; Postmark wired in Phase 2 alongside the asset upload pipeline.
- **WhatsApp HSM template support**: needed for outbound outside the 24h window. Added with the proposal-sent notification in Phase 3.
- **iMessage gateway**: vendor (Sendblue vs Loop) not chosen yet; structure is in place (channel enum, transport interface) for drop-in.
- **Playwright e2e**: structure unstable until Phase 4 hardening pass.

## Acceptance

- All inbound channels create a Lead + Activity within 5s of webhook receipt (measured).
- Reply sent from mobile or web propagates to the channel within 5s.
- Two ad submissions with the same phone collapse into one Contact + one Lead.
- AuditLog has one row per state-changing API call.
- Org-isolation test: a user from Org A cannot read or write anything belonging to Org B (covered by automated test).

# Product Requirements Document — RoofOps

**Project codename:** RoofOps
**Document version:** 1.0
**Owner:** David
**Last updated:** 2026-05-10
**Status:** Approved for Phase 0 build

---

## 1. Executive summary

RoofOps is a full-stack operations platform for roofing and general construction contractors. It covers the entire commercial lifecycle: capturing leads from paid and organic channels, communicating with prospects across messaging platforms, generating AI-assisted proposals, converting approved proposals into work orders and invoices, dispatching crews, collecting payments (including down payments) via Stripe, and closing out jobs with photo documentation.

The product targets small-to-mid-sized contractor businesses (1–50 crews) in North America initially. The core differentiation is (a) AI-driven proposal generation triggered from chat, (b) automatic measurement and material estimation from blueprints, satellite imagery, and field photos, and (c) a unified inbox that handles WhatsApp, iMessage, SMS, and email leads in one place.

The deliverable is a web app (admin/back-office), a React Native mobile app (field/sales/owner), and a backend API with integrations to Stripe, Google Maps Platform, Anthropic, and the major messaging providers.

## 2. Goals and non-goals

### 2.1 Goals

- Reduce the time between "lead arrives" and "proposal sent" from days to under 30 minutes.
- Eliminate manual data entry between lead capture, proposal, contract, work order, and invoice.
- Give field crews a mobile-first interface to consume work orders, log time and photos, and trigger invoices.
- Standardize the workflow stages (Lead → Estimate → Proposal → Contract → Work Order → Job → Invoice → Payment → Closed) so business owners can see a real funnel.
- Collect payments and signed contracts without leaving the platform.

### 2.2 Non-goals (v1)

- Full accounting (GL, payroll, tax filing). RoofOps will integrate with QuickBooks, not replace it.
- Inventory management at warehouse level. v1 only tracks materials per job.
- Multi-tenant SaaS marketplace. v1 is single-org per deployment, with multi-tenant added in a later phase.
- Heavy BIM/CAD rendering. v1 reads floor plans for measurement, but does not edit them.
- Native iPad-only apps. iPad is supported via the universal React Native build with adaptive layouts, not a separate codebase.

## 3. Target users and personas

- **Owner / GM (Web + mobile):** sees the funnel, KPIs, crew utilization, cash flow.
- **Sales rep / estimator (Web + mobile):** triages leads, runs AI estimates, sends proposals and contracts.
- **Office admin (Web):** invoicing, reconciliation, document management.
- **Crew lead / foreman (Mobile-first):** receives work orders, logs progress, uploads job photos, marks complete.
- **Customer / homeowner (External):** receives proposals, signs contracts, pays via Stripe, gets job photos and invoices over their preferred channel.

## 4. Technology stack

### 4.1 Backend
- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 22 LTS
- **Framework:** Fastify
- **ORM:** Prisma
- **Database:** PostgreSQL 16 (primary), Redis 7 (queues, cache, rate limiting, session)
- **Background jobs:** BullMQ on Redis
- **Validation:** Zod everywhere (DTOs, env, webhook payloads)
- **Auth:** JWT access + refresh, Argon2id password hashing, optional WebAuthn for owners; RBAC
- **File storage:** S3-compatible (Backblaze B2 or Cloudflare R2)
- **Search:** PostgreSQL full-text initially; Meilisearch added later if needed
- **Observability:** Pino logs, OpenTelemetry traces, Sentry for errors

### 4.2 Web frontend
- **Framework:** React 19 + Vite
- **Routing:** TanStack Router
- **State:** Zustand (UI) + TanStack Query (server)
- **UI kit:** shadcn/ui + Tailwind CSS
- **Forms:** React Hook Form + Zod resolvers
- **Charts:** Recharts
- **Maps:** Google Maps JavaScript API + Drawing/Geometry libraries

### 4.3 Mobile
- **Framework:** React Native via Expo (managed workflow, EAS Build)
- **Navigation:** React Navigation
- **State:** same Zustand + TanStack Query as web (shared `packages/api-client`)
- **Native modules:** expo-camera, expo-location, expo-document-picker, expo-notifications, Stripe React Native SDK
- **Offline:** TanStack Query persistence + small outbox queue for crew photo uploads and time entries

### 4.4 Monorepo
- **Manager:** pnpm workspaces + Turborepo
- **Layout:** `apps/api`, `apps/web`, `apps/mobile`, `packages/db`, `packages/types`, `packages/api-client`, `packages/ui`, `packages/config`
- **CI/CD:** GitHub Actions
- **DB migrations:** Prisma Migrate

### 4.5 External services
| Concern | Service |
|---|---|
| Payments | Stripe |
| AI proposals + measurement | Anthropic Claude API |
| WhatsApp | Meta WhatsApp Cloud API |
| iMessage | Sendblue or Loop Message |
| SMS fallback | Twilio |
| Email | Postmark (transactional) |
| Maps and satellite | Google Maps Platform (Maps JS, Geocoding, Static Maps, Solar API, Places); EagleView or Hover as premium add-on |
| E-signature | DocuSeal (self-host) or Dropbox Sign |
| Calendar | Native + optional Google Calendar two-way sync |
| Push notifications | Expo Push (mobile), Web Push (web) |

### 4.6 Important platform notes
- **iMessage has no official business API.** Treat as best-effort via Sendblue/Loop; SMS is the reliable fallback.
- **Roof measurement from satellite imagery is hard.** Google Solar API has coverage gaps; manual polygon drawing is the universal fallback; EagleView/Hover is the premium path.
- **Blueprint parsing** is a vision-LLM task in v1. Claude with structured JSON output, confidence per field, human review required.

## 5. High-level architecture

```
                 ┌─────────────────────────────────────────────┐
                 │                  Channels                   │
                 │ Meta Ads · Google Ads · Web forms · iMessage │
                 │      WhatsApp · SMS · Email · Phone         │
                 └────────────────────┬────────────────────────┘
                                      │ webhooks / polling
                 ┌────────────────────▼────────────────────────┐
                 │         Ingestion + Routing Workers         │
                 │              (BullMQ on Redis)              │
                 └────────────────────┬────────────────────────┘
                                      │
            ┌─────────────────────────▼─────────────────────────┐
            │                Fastify API (TS)                   │
            │  Auth · RBAC · Domain modules · Webhooks · BFF    │
            └─────┬──────────────┬─────────────┬───────────────┘
                  │              │             │
            ┌─────▼─────┐  ┌─────▼─────┐  ┌────▼────┐
            │ Postgres  │  │   Redis   │  │   S3    │
            │ (Prisma)  │  │ queues +  │  │ photos, │
            │           │  │  cache    │  │ docs    │
            └───────────┘  └───────────┘  └─────────┘
```

A separate **public customer portal** (link-based, no login required) serves proposals, contracts, payment pages, and job galleries.

## 6. Functional modules

### 6.1 Lead capture and tracking
Sources: Meta Lead Ads, Google Ads Lead Form Extensions, TikTok Lead Generation, organic web form, inbound WhatsApp/SMS/iMessage/email, manual entry, CSV import. Pipeline stages: New → Contacted → Qualified → Estimating → Proposal Sent → Won/Lost/Dormant. SLA tracking, auto-routing, activity timeline, lead-to-customer conversion.

### 6.2 Unified inbox / messaging
One thread per (contact, channel). Smart suggestions from Claude. Attachments incl. voice notes (Whisper-class STT). Opt-out detection, DNC list, retention policy.

### 6.3 AI proposal generation
Two entry points: in-app and chat-triggered (WhatsApp/iMessage/Telegram bots). Pipeline: resolve lead → gather context (photos, blueprints, address, prior messages, price book, markup) → extract measurements → compose line items → render PDF → confidence-flagged human review.

### 6.4 Measurement and estimation
Field photos (geotagged), blueprint extraction (Claude structured output), address-based satellite measurement (Google Solar API), manual polygon drawing, optional EagleView/Hover. Every measurement audit-trailed.

### 6.5 Contracts, terms, and e-signature
Org-level template library, merge fields, e-signature via DocuSeal/Dropbox Sign, signed PDF with content hash for tamper evidence.

### 6.6 Work order and crew dispatch
Won proposal → project + work orders. Crew assignment, skills matching, drag-and-drop weekly scheduler on web, mobile crew view with geofenced clock-in.

### 6.7 Invoicing and payments
Stripe Payment Intents, deposits at acceptance, final invoice on completion. Card / ACH / Apple Pay / Google Pay. Webhooks idempotent with BullMQ retries. QuickBooks export in Phase 5.

### 6.8 Customer portal (no login)
Signed URLs (HMAC-SHA256) per proposal/contract/invoice. Pages: review/accept, sign, pay, gallery, message thread.

### 6.9 Admin and configuration
Org settings (profile, branding, tax rates, waste factors, price book, templates, channel credentials, working hours), users + roles, audit log.

## 7. Domain data model (high level)

`Org`, `User`, `Crew`/`CrewMember`/`Skill`/`CrewSkill`, `Contact`, `Lead`, `Activity`, `MessageThread`/`Message`, `Project`, `Asset`, `Measurement`, `PriceBookItem`, `Proposal`/`ProposalVersion`/`ProposalLineItem`, `Contract`/`ContractVersion`/`Signature`, `WorkOrder`/`WorkOrderTask`, `Invoice`/`InvoiceLineItem`/`Payment`/`Refund`, `Webhook`/`WebhookDelivery`, `AuditLog`.

All money in cents (BigInt). All timestamps UTC. Soft delete via `deleted_at` for customer-facing records.

## 8. Non-functional requirements

- **Performance:** API p95 < 300 ms read, < 800 ms proposal generation kickoff (AI async).
- **Availability:** 99.5% v1, 99.9% target by Phase 6.
- **Security:** TLS, HSTS, secure cookies; secrets vault; org-scoped row-level access at application layer; Stripe PCI SAQ-A; PII column-level encryption.
- **Privacy:** TCPA, CAN-SPAM, WhatsApp policy, GDPR-style export and delete on request.
- **Backups:** nightly `pg_dump` off-site, 30-day retention, PITR by Phase 5.
- **Accessibility:** WCAG 2.1 AA.
- **i18n:** English v1; library wired from day one so Spanish can be enabled later.

## 9. Phased delivery plan

- **Phase 0 — Foundations (2 weeks):** monorepo, Fastify API + auth, Postgres/Prisma, web shell, mobile shell, CI, staging deploy, observability.
- **Phase 1 — Lead capture and unified inbox (4 weeks):** all channel adapters, pipeline UI, dedup, audit log baseline.
- **Phase 2 — Estimating, proposals, and AI (5 weeks):** price book, asset pipeline, measurement service, AI proposal generator, customer portal accept page.
- **Phase 3 — Contracts, payments, work orders, invoicing (5 weeks):** e-sign, Stripe, dispatch board, mobile crew view, invoice end-to-end.
- **Phase 4 — Hardening and pilot (3 weeks):** performance pass, security pass, onboarding, docs, pilot.
- **Phase 5 — Accounting, reporting, advanced ops (4 weeks):** QuickBooks sync, owner dashboard, job costing, calendar sync.
- **Phase 6 — Multi-tenant SaaS readiness (4 weeks):** isolation review, Stripe Connect, self-serve, quotas, status page.
- **Phase 7 — Advanced AI and premium measurement (ongoing):** EagleView/Hover, fine-tuned blueprint model, voice-to-proposal, predictive scoring, storm/weather triggers.

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| iMessage gateway instability or policy change | High | Medium | Best-effort; SMS fallback; abstract behind interface |
| Google Solar API coverage gaps | Medium | Medium | Manual polygon tool always available; premium EagleView/Hover path |
| AI hallucinations on proposal numbers | Medium | High | Never auto-send; confidence scores; strict JSON via Zod; human review |
| WhatsApp template approval delays | Medium | Medium | Pre-submit templates in Phase 1 |
| PCI scope creep | Low | High | Stripe Elements/Checkout only |
| Stripe webhook outages | Low | Medium | Idempotent handlers + BullMQ retries + dead-letter alerts |
| Mobile offline edge cases | High | Low | Outbox queue + "pending sync" indicators |
| Single-org assumption baked in | Medium | High | `org_id` on every domain table from day one |
| Single-engineer bus factor | High | High | Strong docs, CLAUDE.md, ADRs, weekly demos |

## 11. Open questions

- Single-tenant vs multi-tenant from start (current assumption: multi-tenant added in Phase 6).
- Initial geographic market.
- Stripe Standard vs Connect.
- DocuSeal vs Dropbox Sign.
- QuickBooks Desktop support, or QBO only.
- Free AI usage cap vs pass-through pricing.

## 12. Success metrics

- **Time to first response on new leads:** median < 15 min during business hours.
- **Lead-to-proposal time:** median < 30 min once a rep starts work.
- **Proposal-to-acceptance rate:** +20% lift after 3 months.
- **Manual data entry per job:** zero between accept and paid.
- **Crew daily photo upload completion:** > 90%.
- **Stripe payment success rate:** > 98% first attempt.
- **System uptime:** 99.5% v1, 99.9% post-Phase 6.

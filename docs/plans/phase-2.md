# Phase 2 — Estimating, proposals, and AI

**Goal:** sales rep can produce a sendable proposal in under 10 minutes. Target duration: 5 weeks (PRD §9, Phase 2).

**Review checkpoint:** rep messages "draft proposal for Smith, reroof 2400 sq ft asphalt" to the WhatsApp bot → receives a draft link → sends it to the customer → customer clicks Accept on the public portal.

## Scope (per PRD §6.3, §6.4, §6.5, §6.8)

- Price book CRUD + CSV import
- Asset upload pipeline (S3 signed URLs, MIME validation; AV scan + thumbnails slip to Phase 4)
- Measurement service: manual roof polygon (web), Google Solar API fallback, Claude blueprint extractor, field-photo condition tagger
- Proposal builder UI: line items, taxes, deposit %, terms text
- AI proposal generation pipeline (in-app + chat-triggered via WhatsApp / iMessage / Telegram bots)
- PDF rendering server-side (Puppeteer)
- Send proposal as a signed-link URL over the customer's preferred channel
- Customer portal: proposal review and accept page (no login, link-based)

## Build sequence (chunks; each chunk = a commit)

### Chunk A — Domain layer ✅ (this commit)
- Schema: `PriceBookItem`, `Asset`, `Measurement`, `Proposal`, `ProposalVersion` + enums
- Migration `phase2_proposals_assets` extending the `ActivityKind` enum with proposal / measurement / asset events
- Shared Zod types for each entity in `@roofops/types`
- `PROPOSAL_STATUS_TRANSITIONS` matrix shared between API enforcement and UI

### Chunk B — Price book CRUD + CSV import
- Service + routes under `/price-book`
- CSV parse on POST (in-memory; switch to background job in Phase 4)
- Web UI: list + edit dialog + CSV upload

### Chunk C — Asset upload pipeline
- POST `/assets/upload-ticket` → returns presigned S3 PUT URL + assetId
- POST `/assets/:id/finalize` → client reports SHA-256, we mark READY
- Server-side validation: MIME allowlist, size cap, content_hash uniqueness per org
- S3 client wrapper (uses MinIO / Backblaze B2 / R2 via S3-compatible API)
- Audit log on every asset state change

### Chunk D — Measurement service
- Manual polygon area: spherical-excess formula server-side so the client can't spoof area
- Solar API + blueprint extractor are stubbed with a structured interface; real Claude integration in Chunk E
- Routes under `/leads/:leadId/measurements`

### Chunk E — AI proposal generation
- Anthropic SDK with Claude Sonnet 4.6 default, Opus 4.7 for blueprint analysis
- Structured tool-use output: line items, scope-of-work, confidence per field
- Prompt caching on the org price book + style guide (re-used across all proposal generations)
- POST `/proposals/generate` returns a DRAFT proposal with `generatedByAi=true` + `aiReviewNotes`

### Chunk F — Customer portal (public signed link)
- `/portal/proposals/:token` — public read
- POST `/portal/proposals/:token/accept` — signer name + intent
- POST `/portal/proposals/:token/reject` — rejection reason
- Stamp `viewedAt` on first GET; auto-emit Activity rows

### Chunk G — Web UI + PDF render
- `/leads/:id/proposals/new` builder (line items table, deposit/tax inputs, AI assist button)
- `/proposals/:id` detail with version history
- Puppeteer-based PDF render endpoint
- Send-via-channel modal

## What slips to later phases

- ClamAV scanning + image thumbnails + PDF rasterization → Phase 4 hardening (background worker)
- EagleView / Hover integration → Phase 7 (paid add-on)
- WhatsApp HSM templates for proposal-sent notifications → end of Phase 3 alongside e-sign
- Fine-tuned blueprint model → Phase 7

## Acceptance

- Price book seedable from CSV; UI list renders in under 200 ms for 500 items
- An asset upload completes end to end against MinIO / B2 / R2
- A manual polygon roof measurement returns an area within 2% of the reference value (geometry test)
- POST `/proposals/generate` against a seeded price book returns a draft within 30 s
- Customer can open the signed-link portal, view the proposal, click Accept → status `ACCEPTED` + `acceptedAt` + Activity row

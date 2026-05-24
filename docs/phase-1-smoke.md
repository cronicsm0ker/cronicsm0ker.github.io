# Phase 1 end-to-end smoke test

Manual checklist that exercises lead capture → reply → audit on a deployed staging API. Replace `https://api.example.com` and the credential values throughout.

## Prereqs

- API deployed (see `docs/deploy-self-host.md`)
- Web app deployed (Cloudflare Pages, see `docs/setup.md`)
- An authenticated session for a test org (capture access + refresh tokens from `POST /auth/login`)

## 1. Provision a web-form channel credential

```bash
ACCESS=eyJ...   # from /auth/login

curl -fsS -X POST https://api.example.com/channel-credentials \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"channel":"WEB_FORM","label":"Public web form","config":{}}'
# -> { id, channel, label, webhookToken, ... }
```

Note the `webhookToken`. You'll embed it in the public lead-capture form.

## 2. Send a synthetic lead via the web-form ingest

```bash
TOKEN=<webhookToken from step 1>

curl -fsS -X POST "https://api.example.com/public/leads/web-form?token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+14155552671",
    "message": "Need a reroof estimate — 2,400 sq ft asphalt, 6:12 pitch",
    "title": "Reroof estimate request"
  }'
# -> 201 { leadId, contactId }
```

Verify in web UI: `/leads` should show Jane in **NEW** stage; clicking through shows the message in the Inbox.

## 3. Verify dedup

Submit the same form again with the same phone. Confirm no second Lead is created (one Contact, one Lead with two activities).

## 4. Move the lead through stages

```bash
LEAD_ID=<leadId from step 2>

curl -fsS -X POST "https://api.example.com/leads/$LEAD_ID/stage" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"stage":"CONTACTED"}'
```

The lead's `first_responded_at` stamps now. An activity row of kind `LEAD_STAGE_CHANGED` lands in the timeline.

Try an illegal transition:

```bash
curl -i -X POST "https://api.example.com/leads/$LEAD_ID/stage" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"stage":"WON"}'
# -> 409 Conflict: Invalid stage transition: CONTACTED → WON
```

(WON is not in `LEAD_STAGE_TRANSITIONS.CONTACTED`.)

## 5. Reply via the web inbox

In `/inbox` open the thread that landed from the web form. Type a reply and send. The message lands as `OUTBOUND` with status `PENDING` (no transport for `WEB_FORM`; transports are wired for SMS / WhatsApp / EMAIL / TELEGRAM only).

For a transport-backed check, configure a SMS credential and send to a Twilio test number:

```bash
curl -fsS -X POST https://api.example.com/channel-credentials \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{
    "channel":"SMS",
    "label":"Primary Twilio",
    "config": {
      "accountSid":"AC...",
      "authToken":"...",
      "fromNumber":"+15005550006"
    }
  }'
```

Then `POST /messages` with `{ contactId, channel: "SMS", body }`. The created message goes to `SENT` and carries the Twilio SID in `externalId`.

## 6. Org-isolation smoke

Quick negative-path: create a second org, log in as a user there, attempt `GET /leads/$LEAD_ID`. Expect 404.

For automated coverage of the same property, see `apps/api/src/services/__tests__/org-isolation.test.ts` — runs in CI against the Postgres service.

## 7. Audit trail

```bash
sudo -u postgres psql roofops -c \
  "SELECT action, entity_type, entity_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10;"
```

Each lead/contact/credential write should produce one row.

## Acceptance

| Property | Verified by |
|---|---|
| Inbound channel → Lead + Activity | Step 2 + Step 3 |
| Dedup on (org, phone\|email) | Step 3 |
| Stage transitions enforced | Step 4 |
| Outbound message delivered through transport | Step 5 (SMS path) |
| Cross-org reads blocked | Step 6 + `org-isolation.test.ts` |
| Every state change audit-logged | Step 7 |

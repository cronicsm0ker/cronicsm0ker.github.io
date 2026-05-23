-- Phase 1: leads, activities, messaging, channel credentials, audit logs.

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM (
    'NEW', 'CONTACTED', 'QUALIFIED', 'ESTIMATING', 'PROPOSAL_SENT',
    'WON', 'LOST', 'DORMANT'
);

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM (
    'WEB_FORM', 'META_ADS', 'GOOGLE_ADS', 'TIKTOK_ADS',
    'WHATSAPP', 'SMS', 'IMESSAGE', 'EMAIL', 'TELEGRAM', 'PHONE',
    'MANUAL', 'CSV_IMPORT', 'REFERRAL', 'OTHER'
);

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM (
    'LEAD_CREATED', 'LEAD_STAGE_CHANGED', 'LEAD_ASSIGNED', 'LEAD_NOTE',
    'MESSAGE_INBOUND', 'MESSAGE_OUTBOUND', 'CALL_LOGGED',
    'PROPOSAL_SENT', 'PROPOSAL_VIEWED', 'PROPOSAL_ACCEPTED',
    'CONTACT_MERGED', 'CHANNEL_OPTED_OUT'
);

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM (
    'WHATSAPP', 'IMESSAGE', 'SMS', 'EMAIL', 'TELEGRAM', 'WEB_FORM'
);

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- Expand contacts
ALTER TABLE "contacts"
  ADD COLUMN "email_norm" TEXT,
  ADD COLUMN "phone_norm" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "preferred_channel" "MessageChannel",
  ADD COLUMN "opted_out_at" TIMESTAMP(3);

-- Backfill normalized fields from existing rows (lowercase email, raw phone for now).
UPDATE "contacts" SET "email_norm" = LOWER("email") WHERE "email" IS NOT NULL;
UPDATE "contacts" SET "phone_norm" = "phone" WHERE "phone" IS NOT NULL;

-- Replace the original email/phone indexes with normalized versions
DROP INDEX IF EXISTS "contacts_org_id_email_idx";
DROP INDEX IF EXISTS "contacts_org_id_phone_idx";
CREATE INDEX "contacts_org_id_email_norm_idx" ON "contacts"("org_id", "email_norm");
CREATE INDEX "contacts_org_id_phone_norm_idx" ON "contacts"("org_id", "phone_norm");

-- CreateTable: leads
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "owner_id" UUID,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "source" "LeadSource" NOT NULL,
    "source_meta" JSONB,
    "title" TEXT,
    "notes" TEXT,
    "first_responded_at" TIMESTAMP(3),
    "sla_breached_at" TIMESTAMP(3),
    "won_at" TIMESTAMP(3),
    "lost_at" TIMESTAMP(3),
    "lost_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_org_id_stage_created_at_idx" ON "leads"("org_id", "stage", "created_at");
CREATE INDEX "leads_org_id_owner_id_stage_idx" ON "leads"("org_id", "owner_id", "stage");
CREATE INDEX "leads_org_id_contact_id_idx" ON "leads"("org_id", "contact_id");
CREATE INDEX "leads_org_id_source_idx" ON "leads"("org_id", "source");

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- CreateTable: message_threads
CREATE TABLE "message_threads" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "lead_id" UUID,
    "channel" "MessageChannel" NOT NULL,
    "external_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_threads_org_id_channel_external_id_key" ON "message_threads"("org_id", "channel", "external_id");
CREATE INDEX "message_threads_org_id_contact_id_channel_idx" ON "message_threads"("org_id", "contact_id", "channel");
CREATE INDEX "message_threads_org_id_last_message_at_idx" ON "message_threads"("org_id", "last_message_at");

ALTER TABLE "message_threads"
  ADD CONSTRAINT "message_threads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "message_threads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE;

-- CreateTable: messages
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "external_id" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "sent_by" UUID,
    "attachments" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messages_org_id_channel_external_id_key" ON "messages"("org_id", "channel", "external_id");
CREATE INDEX "messages_org_id_thread_id_created_at_idx" ON "messages"("org_id", "thread_id", "created_at");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- CreateTable: activities
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "contact_id" UUID,
    "lead_id" UUID,
    "thread_id" UUID,
    "message_id" UUID,
    "actor_id" UUID,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activities_org_id_lead_id_created_at_idx" ON "activities"("org_id", "lead_id", "created_at");
CREATE INDEX "activities_org_id_contact_id_created_at_idx" ON "activities"("org_id", "contact_id", "created_at");
CREATE INDEX "activities_org_id_kind_created_at_idx" ON "activities"("org_id", "kind", "created_at");

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "activities_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "activities_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- CreateTable: channel_credentials
CREATE TABLE "channel_credentials" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "webhook_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "disabled_at" TIMESTAMP(3),

    CONSTRAINT "channel_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_credentials_webhook_token_key" ON "channel_credentials"("webhook_token");
CREATE UNIQUE INDEX "channel_credentials_org_id_channel_label_key" ON "channel_credentials"("org_id", "channel", "label");
CREATE INDEX "channel_credentials_org_id_channel_idx" ON "channel_credentials"("org_id", "channel");

ALTER TABLE "channel_credentials"
  ADD CONSTRAINT "channel_credentials_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_org_id_created_at_idx" ON "audit_logs"("org_id", "created_at");
CREATE INDEX "audit_logs_org_id_entity_type_entity_id_idx" ON "audit_logs"("org_id", "entity_type", "entity_id");
CREATE INDEX "audit_logs_org_id_actor_id_created_at_idx" ON "audit_logs"("org_id", "actor_id", "created_at");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;

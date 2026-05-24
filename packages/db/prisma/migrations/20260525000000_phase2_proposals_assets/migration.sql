-- Phase 2: price book, assets, measurements, proposals.

-- Extend ActivityKind with proposal / measurement / asset events. Each
-- ADD VALUE must be a separate statement because postgres enum alters
-- can't be batched inside a transaction (Prisma migrate wraps each file
-- in a single tx; see `MIGRATION_LOCK` for the workaround if this
-- breaks). For NEW DBs Prisma will CREATE the enum with these values
-- since the schema's enum block lists them all.
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'PROPOSAL_CREATED';
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'PROPOSAL_REJECTED';
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'MEASUREMENT_RECORDED';
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'ASSET_UPLOADED';

-- CreateEnum
CREATE TYPE "PriceBookKind" AS ENUM ('MATERIAL', 'LABOR', 'FEE');
CREATE TYPE "AssetKind" AS ENUM (
    'PHOTO', 'BLUEPRINT', 'DOCUMENT', 'PROPOSAL_PDF',
    'SIGNED_CONTRACT', 'THUMBNAIL', 'OTHER'
);
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'READY', 'REJECTED');
CREATE TYPE "AssetOwnerType" AS ENUM ('CONTACT', 'LEAD', 'PROPOSAL');
CREATE TYPE "MeasurementMethod" AS ENUM (
    'BLUEPRINT', 'MANUAL_POLYGON', 'SOLAR_API', 'EAGLEVIEW', 'MANUAL', 'FIELD_PHOTO'
);
CREATE TYPE "MeasurementUnit" AS ENUM ('SQFT', 'LF', 'EACH', 'COUNT', 'SQUARES');
CREATE TYPE "ProposalStatus" AS ENUM (
    'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'
);

-- CreateTable: price_book_items
CREATE TABLE "price_book_items" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "kind" "PriceBookKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "unit_cost_cents" BIGINT NOT NULL,
    "markup_bps" INTEGER NOT NULL DEFAULT 3000,
    "waste_factor_bps" INTEGER NOT NULL DEFAULT 1000,
    "sku" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_book_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "price_book_items_org_id_name_key" ON "price_book_items"("org_id", "name");
CREATE INDEX "price_book_items_org_id_kind_idx" ON "price_book_items"("org_id", "kind");
CREATE INDEX "price_book_items_org_id_archived_at_idx" ON "price_book_items"("org_id", "archived_at");

ALTER TABLE "price_book_items"
    ADD CONSTRAINT "price_book_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;

-- CreateTable: assets
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "owner_type" "AssetOwnerType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "thumbnail_key" TEXT,
    "content_hash" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by" UUID,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assets_s3_key_key" ON "assets"("s3_key");
CREATE UNIQUE INDEX "assets_thumbnail_key_key" ON "assets"("thumbnail_key");
CREATE INDEX "assets_org_id_owner_type_owner_id_idx" ON "assets"("org_id", "owner_type", "owner_id");
CREATE INDEX "assets_org_id_kind_idx" ON "assets"("org_id", "kind");
CREATE INDEX "assets_org_id_content_hash_idx" ON "assets"("org_id", "content_hash");

ALTER TABLE "assets"
    ADD CONSTRAINT "assets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- CreateTable: measurements
CREATE TABLE "measurements" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "lead_id" UUID,
    "asset_id" UUID,
    "method" "MeasurementMethod" NOT NULL,
    "label" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "unit" "MeasurementUnit" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "notes" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "measurements_org_id_lead_id_created_at_idx" ON "measurements"("org_id", "lead_id", "created_at");
CREATE INDEX "measurements_org_id_method_idx" ON "measurements"("org_id", "method");

ALTER TABLE "measurements"
    ADD CONSTRAINT "measurements_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "measurements_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL;

-- CreateTable: proposals
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "public_token_hash" TEXT NOT NULL,
    "current_version_id" UUID,
    "generated_by_ai" BOOLEAN NOT NULL DEFAULT false,
    "ai_confidence" INTEGER,
    "sent_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proposals_public_token_hash_key" ON "proposals"("public_token_hash");
CREATE INDEX "proposals_org_id_lead_id_idx" ON "proposals"("org_id", "lead_id");
CREATE INDEX "proposals_org_id_status_created_at_idx" ON "proposals"("org_id", "status", "created_at");
CREATE INDEX "proposals_org_id_contact_id_idx" ON "proposals"("org_id", "contact_id");

ALTER TABLE "proposals"
    ADD CONSTRAINT "proposals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "proposals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;

-- CreateTable: proposal_versions
CREATE TABLE "proposal_versions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "deposit_cents" BIGINT NOT NULL,
    "tax_rate_bps" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proposal_versions_proposal_id_version_key" ON "proposal_versions"("proposal_id", "version");
CREATE INDEX "proposal_versions_org_id_proposal_id_version_idx" ON "proposal_versions"("org_id", "proposal_id", "version");

ALTER TABLE "proposal_versions"
    ADD CONSTRAINT "proposal_versions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "proposal_versions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE;

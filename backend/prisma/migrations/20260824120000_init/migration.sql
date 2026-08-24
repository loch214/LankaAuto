-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('IN_STOCK', 'LOW', 'OUT_OF_STOCK', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('PRICE_LIST', 'STAFF');

-- CreateEnum
CREATE TYPE "ParseSource" AS ENUM ('LEXICON', 'LLM', 'MANUAL');

-- CreateEnum
CREATE TYPE "FitmentSource" AS ENUM ('INGESTED', 'STAFF');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" UUID,
    "attribute_schema" JSONB,
    "verification_interval_days" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "is_oem" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "brand_id" UUID,
    "raw_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "part_number" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "last_verified_at" TIMESTAMPTZ(3),
    "verified_source" "VerificationSource",
    "location" TEXT,
    "parse_confidence" DOUBLE PRECISION NOT NULL,
    "parse_source" "ParseSource" NOT NULL,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "source_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "chassis_code" TEXT,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "engine_type" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "identity_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_fitments" (
    "id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "source" "FitmentSource" NOT NULL DEFAULT 'INGESTED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "notes" TEXT,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_fitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_embeddings" (
    "id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "embedding" vector(768) NOT NULL,
    "source_text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_log" (
    "id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "user_id" UUID,
    "old_status" "AvailabilityStatus",
    "new_status" "AvailabilityStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" UUID NOT NULL,
    "source_file" TEXT NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'RUNNING',
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_parsed_by_rule" INTEGER NOT NULL DEFAULT 0,
    "rows_parsed_by_llm" INTEGER NOT NULL DEFAULT 0,
    "rows_flagged" INTEGER NOT NULL DEFAULT 0,
    "rows_failed" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "notes" TEXT,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_rows" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "raw_name" TEXT NOT NULL,
    "normalized_name" TEXT,
    "parsed_attributes" JSONB,
    "parse_source" "ParseSource",
    "parse_confidence" DOUBLE PRECISION,
    "error" TEXT,
    "part_id" UUID,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staging_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_normalized_name_key" ON "brands"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "parts_source_key_key" ON "parts"("source_key");

-- CreateIndex
CREATE INDEX "parts_category_id_idx" ON "parts"("category_id");

-- CreateIndex
CREATE INDEX "parts_brand_id_idx" ON "parts"("brand_id");

-- CreateIndex
CREATE INDEX "parts_part_number_idx" ON "parts"("part_number");

-- CreateIndex
CREATE INDEX "parts_needs_review_idx" ON "parts"("needs_review");

-- CreateIndex
CREATE INDEX "parts_availability_status_last_verified_at_idx" ON "parts"("availability_status", "last_verified_at");

-- CreateIndex
CREATE INDEX "parts_attributes_idx" ON "parts" USING GIN ("attributes" jsonb_path_ops);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_identity_key_key" ON "vehicles"("identity_key");

-- CreateIndex
CREATE INDEX "vehicles_make_model_idx" ON "vehicles"("make", "model");

-- CreateIndex
CREATE INDEX "part_fitments_vehicle_id_idx" ON "part_fitments"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "part_fitments_part_id_vehicle_id_key" ON "part_fitments"("part_id", "vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "part_embeddings_part_id_model_key" ON "part_embeddings"("part_id", "model");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "verification_log_part_id_created_at_idx" ON "verification_log"("part_id", "created_at");

-- CreateIndex
CREATE INDEX "verification_log_created_at_idx" ON "verification_log"("created_at");

-- CreateIndex
CREATE INDEX "staging_rows_run_id_processed_at_idx" ON "staging_rows"("run_id", "processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "staging_rows_run_id_row_number_key" ON "staging_rows"("run_id", "row_number");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_fitments" ADD CONSTRAINT "part_fitments_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_fitments" ADD CONSTRAINT "part_fitments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_fitments" ADD CONSTRAINT "part_fitments_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_embeddings" ADD CONSTRAINT "part_embeddings_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_log" ADD CONSTRAINT "verification_log_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_log" ADD CONSTRAINT "verification_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_rows" ADD CONSTRAINT "staging_rows_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ingestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_rows" ADD CONSTRAINT "staging_rows_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===========================================================================
-- HAND-WRITTEN. Do not delete when regenerating this file.
-- ===========================================================================
--
-- HNSW index for semantic search (Milestone 1C, Phase 3).
--
-- Prisma cannot express an index on an `Unsupported` column, so it does not
-- know this exists. Two consequences you MUST know:
--
--   1. Every future `prisma migrate dev` will generate a migration containing
--      `DROP INDEX "part_embeddings_embedding_hnsw_idx"`. DELETE that line
--      before applying it. `npm run check:db` fails loudly if the index goes
--      missing, so this cannot be silently forgotten.
--
--   2. The index is kept HERE, inside the migration, rather than in a separate
--      script. Any database object outside the migration history is permanent
--      drift, and `migrate dev` then wants to reset the whole dev database on
--      every schema change -- which would destroy ingested data in 1B. A
--      manual step guarded by an automated check beats recurring data loss.
--
-- Cosine distance, because Gemini embeddings are normalised. The query-time
-- operator (`<=>`) MUST match `vector_cosine_ops` here; if it does not,
-- Postgres silently ignores the index and sequentially scans every part --
-- correct results, terrible latency, no error to explain why.
--
-- m = 16 / ef_construction = 64 are the pgvector defaults. Higher means better
-- recall and a slower, hungrier build. Tune against the eval set in 1C.
--
-- Bulk-load note: building on an empty table is free. When re-embedding the
-- whole catalogue later, DROP the index, insert, then recreate -- incremental
-- HNSW insertion is dramatically slower than one bulk build.
CREATE INDEX "part_embeddings_embedding_hnsw_idx"
    ON "part_embeddings"
    USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

# LankaAuto — backend

Catalogue, ingestion pipeline, and retrieval. See [`../PLAN.md`](../PLAN.md)
for the project design; §12 records the settled decisions and open questions.

**Milestone status:** 1A complete (setup + schema). 1B (ingestion) is next and
is blocked on real sample rows from the shop's price list.

---

## Getting started

Requires Docker Desktop and Node 20+.

```bash
cp .env.example .env       # then fill in GEMINI_API_KEY (not needed for 1A)
npm install
npm run db:up              # start Postgres (pgvector) on localhost:5433
npm run migrate:apply      # apply migrations
npm run check:db           # verify the database is correctly built
```

`npm run db:verify` does a full reset and re-verifies from scratch — the
milestone 1A checkpoint. It is destructive and intended only for the local
development database.

## Scripts

| Script | What it does |
|---|---|
| `db:up` / `db:down` | start / stop the Postgres container |
| `db:nuke` | stop **and delete the volume** — full wipe |
| `db:psql` | psql shell inside the container |
| `db:studio` | Prisma Studio, a browsable UI for the data |
| `migrate` | generate a migration for review (**does not apply it**) |
| `migrate:apply` | apply pending migrations, then verify |
| `db:reset` | drop, recreate, replay all migrations — **destroys all data** |
| `db:verify` | `db:reset` + `check:db` — the 1A checkpoint |
| `check:db` | 10 assertions that the database is correctly built |
| `typecheck` | `tsc --noEmit` |

---

## ⚠️ The one thing you must know: Prisma cannot see the vector index

`part_embeddings.embedding` is `Unsupported("vector(768)")` because Prisma has
no vector type. Two consequences follow, and both will bite if forgotten.

### 1. Prisma Client cannot read or write that column

Every embedding read and write is raw SQL via `$queryRaw` / `$executeRaw`.
This is expected, not a workaround.

### 2. Every generated migration will try to DROP the HNSW index

Prisma diffs `schema.prisma` against the migration history. The index cannot
appear in `schema.prisma`, so Prisma concludes it is unwanted and emits:

```sql
-- DropIndex
DROP INDEX "part_embeddings_embedding_hnsw_idx";
```

**Delete that line before applying the migration.**

This is why `npm run migrate` uses `--create-only` — plain `prisma migrate dev`
auto-applies, which would drop the index silently. The workflow is:

```bash
npm run migrate            # generates the migration, does NOT apply it
#   → open it, delete any DROP of part_embeddings_embedding_hnsw_idx
npm run migrate:apply      # applies, then runs check:db
```

`check:db` fails loudly in both failure modes — if the index is missing from
the database, and if any migration file contains the DROP. An instruction a
human must remember forever is a defect waiting to happen; this converts it
into a failing check.

### Why not keep the index outside migrations?

That was tried. Moving it to a separate SQL script removes the spurious DROP,
but any database object outside the migration history is *permanent drift* —
`migrate dev` then wants to reset the entire dev database on every schema
change, destroying ingested data. A manual step guarded by an automated check
beats recurring data loss.

---

## Schema notes

Full reasoning is in the comments in
[`prisma/schema.prisma`](prisma/schema.prisma). The decisions worth knowing:

- **`parts.source_key`** (unique) is the ingestion idempotency key. Ingestion
  UPSERTs on it, so re-running the pipeline after a parser fix cannot double
  the catalogue.
- **`part_fitments`** is a real join table. Fitment is many-to-many and is a
  fact you assert and correct, not a value recomputed from JSONB attributes.
- **`vehicles.identity_key`** exists because Postgres treats every `NULL` as
  distinct in a unique index — so `@@unique([make, model, chassisCode])` would
  permit exactly the duplicates it was meant to prevent.
- **`part_embeddings` stores `model` and `dim`.** Without them, a partial
  re-embed silently mixes two vector spaces in one index: no error, retrieval
  quality just quietly degrades.
- **`parts.parse_confidence`** is derived from `parse_source` (which extractor
  fired), never from the LLM's self-reported confidence, which is not
  calibrated.
- **No `price` column** — deliberately out of scope, like stock counts. Raw CSV
  rows are preserved in `staging_rows`, so adding pricing later is a backfill
  rather than a re-ingest.
- **`cross_references` and `part_documents` are absent on purpose.** See
  PLAN.md §12. `check:db` asserts they have not reappeared.

## Cosine distance

The HNSW index is built with `vector_cosine_ops`, so queries must use the
`<=>` operator. Using a different operator does not error — Postgres silently
ignores the index and sequentially scans every part. Correct results,
terrible latency, no explanation. `check:db` asserts the opclass.

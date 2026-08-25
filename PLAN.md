# LankaAuto — Project Plan

**LankaAuto** — a spare parts catalogue and AI lookup assistant for a retail auto spare parts shop.

## 1. Project Overview

A web app for a **retail auto spare parts shop** (thousands of part types, many brands, walk-in customers only).

**This app does NOT handle online ordering, cart, or payments.** It is a showcase + lookup tool.

Two personas:

- **Customers** (no login): browse the catalogue via a public showcase site, and use an AI assistant to find the part they need — whether they have a part number, a vague description, or just a car model
- **Staff** (login required): look up parts fast during a customer interaction, check availability status, find physical location, and cross-reference brands

The core technical goal is a **grounded lookup agent** built on **hybrid retrieval over a structured catalogue** — exact match, fuzzy match, and vector search, each used where it actually belongs, with every answer cited.

> **⚠️ Honesty note — read before writing the README or talking about this in an interview.**
> Until `part_documents` has a real data source (see §6), this is **not** "RAG over documents." The retrieval corpus is part names and parsed attributes — there is no prose to chunk, retrieve, or cite passages from. Matching *"front brake pads for a 2015 Vitz"* to `BRAKE PAD SET TOYOTA VITZ KSP130 FR` is a genuine retrieval problem with near-zero lexical overlap, and that claim stands on its own. The document-RAG claim does not, while that table is empty. Call it what it is.

---

## 2. The Real Problem Being Solved

In a retail spare parts shop, the hard problems are **not** inventory math. They are:

1. **Identification** — a customer describes a part vaguely ("front brake pads for a Vitz"), brings a part number, or brings the old part. Staff must map that to one of thousands of SKUs across many brands.
2. **Cross-referencing** — customer has an OEM part number and wants to know which aftermarket brands make an equivalent, or wants a cheaper alternative brand for the same part.
3. **Fitment** — "will this actually fit their car?"
4. **Physical location** — with thousands of items, knowing which rack/shelf/bin a part is in saves real time.

Exact stock counts are deliberately **out of scope** — see section 5.

---

## 3. Tech Stack

**Backend**

- Node.js + Express + TypeScript
- PostgreSQL (relational data + JSONB for flexible per-category attributes)
- pgvector extension (vector storage in the same DB — no separate vector DB)
- Prisma ORM for schema/migrations and normal queries; raw SQL via `$queryRaw` for vector similarity search
- JWT auth (`jsonwebtoken` + `bcrypt`) — staff only; customer side is fully public
- Zod for request validation

**Frontend**

- React + TypeScript + Vite
- Tailwind CSS
- React Router
- TanStack Query for server state

**AI**

- LLM: Groq (Llama 3.3 70B) or Gemini — function calling / tool use *(decided at Phase 5)*
- Embeddings: **Gemini `gemini-embedding-001`, truncated to 768 dimensions** — no local Python service
  - **Decided in Phase 1 and hard to change:** the dimension is baked into the `vector(768)` column at migration time. Switching models later means a migration plus a full re-embed, which is why `part_embeddings` stores `model` and `dim` alongside every vector.

**Local infrastructure**

- Docker Compose running `pgvector/pgvector:pg16` on port **5433** (avoids clashing with any existing local Postgres install)

---

## 4. Data Foundation — Parsing Real Price Lists

Seed data comes from the shop's existing **price lists** (e.g. a "Brake Pads" list with hundreds of records). Each record is a semi-structured part name string:

```
BRAKE PAD SET TOYOTA COROLLA AE100 FRONT
OIL FILTER NISSAN SUNNY B14
```

These encode part type, make, model, chassis code, and position — but inconsistently.

**Pipeline (batch job, not runtime — and re-run often, so it must be idempotent):**

1. **Load** raw price-list rows (CSV export) into a `staging_rows` table **verbatim**, tagged with a run id. Nothing is parsed yet. This makes the run resumable — a crash at row 800 shouldn't cost 800 LLM calls — and preserves columns the domain model drops, such as price.
2. **Normalize** — uppercase, collapse whitespace, expand known abbreviations (`FR` → `FRONT`, `R/H` → `RIGHT`). A pure function, unit tested.

   ⚠️ **"Strip punctuation noise" was wrong and has been removed.** Punctuation in the real data is load-bearing: `T/ACE` (Toyoace), `L/ACE` (Liteace), `D/CAB` (double cab) and the part code `GU 7280/4` all contain a slash that must survive, while `CORONA/CARINA` and `B210/B310` must split on it. There is no context-free rule. See `backend/docs/01-source-profile-gmb-ujoint.md` §6.
3. **Rule-based extraction** — match against a checked-in lexicon, hand-built by inspecting the distinct tokens in the real data. Record *which* rule fired for each field.

   The lexicon is **typed**, not a flat token list: one source column mixes model names, chassis codes, engine codes, body styles and product types (`DYNA 15B/SO5C/JO5C` is model + three engine codes; `4M40/INTECOOLER` has no model at all). The extractor emits **typed spans**. It also **matches longest-first and splits only the residue** — splitting before lookup destroys `T/ACE`. Entries carry misspelling aliases (`HI-LUC` → `HILUX`), since the same file spells one model two ways.
4. **LLM fallback — on the unparsed residue only.** Batched (~20 rows per call), strict JSON schema output, cached by normalized-string hash so re-runs are free.
5. Store the **original raw name** (never discard it — it's the source of truth and gets cited) alongside the **parsed attributes**, upserted by `source_key`.
6. Derive `vehicles` and `part_fitments` from the parsed make / model / chassis code.
7. Generate an embedding of the raw name + parsed fields for semantic search.
8. Flag low-confidence parses for manual staff review.

**Why deterministic-first, not LLM-first.** Look at the data: `TOYOTA`, `COROLLA`, `AE100`, `FRONT` are all closed vocabularies — makes are a list of about forty, positions are about eight tokens, chassis codes match a regex family. Sending every row to an LLM one at a time is minutes of wall clock, real cost, and a *different answer every run*. Rules first is faster, cheaper, reproducible, and it produces a metric worth quoting: *"87% parsed by rules, 11% by LLM fallback, 2% flagged for review."*

This parsing step is a genuine engineering problem and a strong portfolio talking point — it's real messy data, not invented demo data.

---

## 5. Availability Model (Deliberate Design Decision)

Exact stock counts are **not tracked**. In a retail shop with thousands of SKUs and no POS discipline, counts go stale within days, and wrong numbers are worse than no numbers.

Instead:

- **Status, not count**: each part has `IN_STOCK` / `LOW` / `OUT_OF_STOCK` / `UNVERIFIED`
- **Freshness indicator**: every status has a `last_verified_at` timestamp, surfaced in the UI as "verified 3 days ago". This turns the limitation into a transparency feature.
- **Rotating verification**: staff verify one category at a time (e.g. Mon = brakes, Tue = filters). The app tracks which categories are overdue and nudges staff.
- **One-tap updates**: staff search a part → tap a status button. No forms, no quantity entry. Low friction is what keeps it alive.

**Customer-facing UI does not show availability status or freshness at all** (revised 2026-08-26) — status/freshness is a staff-facing tool (search + reports), not a customer promise. Customers are directed to call or visit the shop to check availability; the customer chat agent's tools don't even return the status field, so it's structurally impossible for the agent to state or imply stock levels.

---

## 6. Database Schema (draft)

### `categories`

- `id`, `name` (e.g. "Brake Pads", "Oil Filters", "Alternators"), `parent_id` (nullable — supports sub-categories)
- `attribute_schema` (JSONB — defines which attributes parts in this category have)

### `brands`

- `id`, `name`, `is_oem` (boolean), `country`, `notes`

### `parts`

- `id`, `category_id` (FK), `brand_id` (FK)
- `raw_name` (the original price-list string — source of truth, used for citation)
- `part_number` (nullable), `attributes` (JSONB — parsed values)
- `availability_status` (enum), `last_verified_at`
- `location` (rack/shelf/bin string, nullable)
- `parse_confidence` (float — flags rows needing review). **Derived from extractor provenance, not self-reported by the LLM** — models say 0.9 when they're guessing. Lexicon hit ≈ 0.95, LLM with all fields ≈ 0.7, LLM with gaps ≈ 0.4. Then the number actually means something to the review queue.
- `source_key` (unique) — `sha256(source_file + normalized_raw_name + brand)`. **Ingestion is an upsert, not an insert.** It will be re-run after every parser fix and for every new monthly price list; without a stable key, run #2 silently doubles the catalogue.
- **No `price` column — deliberately out of scope**, same reasoning as stock counts (§5). The price column in the source CSV is preserved verbatim in `staging_rows`, so adding pricing later is a backfill rather than a full re-ingest.
- Note: `part_number` is **not** globally unique — the same number recurs across brands. Unique on `(brand_id, part_number)` at most, and don't add even that constraint until the real data has been inspected.

### `part_fitments` — **added; the original plan was missing this**

- `id`, `part_id` (FK), `vehicle_id` (FK), `source` (`INGESTED` / `STAFF`), `confidence`, `verified_by` (nullable), `notes`

Without this, `vehicles` is an orphan table — nothing linked parts to it — and `check_fitment` degenerates into fuzzy JSONB attribute comparison at runtime. That's the wrong shape: fitment is many-to-many (one pad fits AE100/AE110/AE111; one car takes hundreds of parts), and it's a **fact you assert and can correct**, not a value you recompute. Attribute comparison also produces confident false positives — "Corolla" spans a dozen generations.

`check_fitment` therefore becomes a lookup, with an explainable fallback: *"no asserted fitment on record; attributes suggest a possible match — please confirm with the shop."* Distinguishing **"I know"** from **"I'm guessing"** is worth more than a heuristic that always answers.

Populated during Phase 1 ingestion from parsed chassis codes — `vehicles` rows are derived there too. Doing this later means a backfill migration over every part.

### `part_embeddings`

- `id`, `part_id` (FK), `embedding` (`vector(768)`), `source_text` (what was embedded)
- `model`, `dim`, `created_at` — **required.** Without a model column, a partial re-embed silently mixes vector spaces in one index: no error anywhere, search quality just quietly degrades.
- Prisma has no vector type. This column is `Unsupported("vector(768)")`, which means **Prisma Client cannot read or write it at all** — every embedding read and write is raw SQL, and the HNSW index lives in hand-edited migration SQL.

### ~~`cross_references`~~ — ❌ CUT until the data question is answered

**Blocked on an open question: does cross-reference data exist in writing anywhere, or only in Dad's and Uncle's heads?**

The answer changes the design completely, so the table is not being built yet:

- **If it exists as a list** → it's an ingestion output, parsed and loaded like everything else.
- **If it's tacit knowledge** → it's a *staff data-entry feature*: UI, validation, an entry workflow, and someone's time to populate it. Different design, materially more effort.

Designing the table before knowing which one it is means designing for data that may not exist.

**Known design trap for when it is built:** `EQUIVALENT` is symmetric and arguably transitive; `SUPERSEDES` is strictly directional. Putting both in one `(part_id_a, part_id_b, relationship)` table means queries must search both columns and flip semantics per relationship type, and equivalence classes fragment (enter A≡B and B≡C, then a search from A misses C). Preferred fix: an `interchange_group_id` on `parts` for equivalence — transitive for free, one query — with a separate table for genuinely directional relations.

**This blocks:** agent tool 4 (`find_cross_references`) and all of Phase 8. Ask early.

### `vehicles`

- `id`, `make`, `model`, `chassis_code`, `year_from`, `year_to`, `engine_type`
- `attributes` (JSONB — vehicle-side attributes used for fitment matching)

### ~~`part_documents`~~ — ⏸️ DEFERRED, no data source exists

- *Intended shape:* `id`, `part_id` (FK, nullable), `category_id` (FK, nullable), `content` (text), `embedding` (vector)
- *Intended content:* manufacturer notes, fitment warnings, known-issue text, installation notes

Nothing in this plan produces that content. Building the table, the embedding path, and the `retrieve_part_notes` tool now would ship an agent tool that always returns nothing — worse than not having the tool at all.

**See the honesty note in §1**: this table was carrying much of the "real RAG" justification, and that claim is deferred along with it.

**Candidate source, after Phase 5 — the interesting version.** Rather than scraping datasheets, capture the shop's *tacit* knowledge as short dictated notes: which Corolla generations share a pad, which aftermarket brand's clips snap on install, which two parts customers habitually confuse. That knowledge exists nowhere in writing. Turning undocumented expert knowledge into a retrievable corpus is a better story than any PDF scrape, and it restores document retrieval honestly. Revisit once Phases 1–5 have proven the retrieval layer and it's clear which notes would actually help.

### `users` (staff only)

- `id`, `name`, `email`, `password_hash`, `role` (`STAFF` / `ADMIN`)

### `verification_log`

- `id`, `part_id`, `user_id`, `old_status`, `new_status`, `timestamp`
- Audit trail + drives the rotating-verification nudges

---

## 7. Agent Capabilities

### Shared tools (both agents)

1. **`find_part_by_number(part_number)`**
   → Exact + fuzzy match on part number, including cross-referenced equivalents

2. **`find_part_by_description(query, vehicle_hint?)`**
   → Semantic/vector search over `part_embeddings`. This is the core RAG path — matches "front brake pads for a 2015 Vitz" against `BRAKE PAD SET TOYOTA VITZ KSP130 FR` despite almost no shared words

3. **`check_fitment(part_id, vehicle_id)`**
   → Looks up asserted `part_fitments`. Returns match / no-match / **ambiguous**, which attributes matched, and any retrieved fitment notes.

   **The `vehicle → part` direction is one-to-many, and the data cannot always narrow it.** Confirmed against the GMB U-joint list (`backend/docs/01-source-profile-gmb-ujoint.md` §9): three distinct parts — `GUM 75`, `GUM 87`, `GUM 93` — all carry the fitment `MITSUBISHI CANTER,ROSA`, at prices differing by 30%. They are genuinely different joints, distinguished by cross diameter × cap length, and **those dimensions are not in the source data**. Neither is a year range.

   This is correct data, not dirty data, so no amount of parser work fixes it. The tool must therefore be able to return **several candidates plus a statement of what would disambiguate them** — *"three U-joints are listed for the Canter; they differ by size, which this price list doesn't record. Please confirm with the shop, or measure the old joint."* Collapsing that to a single confident answer would be a fabrication.

   Do not design the tool signature, the agent prompt, or the UI around a single-part return.

4. **`find_cross_references(part_id)`** — ❌ **BLOCKED**
   → Returns equivalent parts across brands (OEM ↔ aftermarket, alternative brands)
   → *Blocked on the cross-reference data question (§6). This is one of only five shared tools and the whole of Phase 8 hangs off it — if the data is tacit, Phase 8 becomes a staff data-entry feature rather than an ingestion output.*

5. **`retrieve_part_notes(part_id or category_id)`** — ⏸️ **DEFERRED**
   → Vector search over `part_documents` for manufacturer notes/warnings
   → *Deferred with the table (§6). A tool that always returns nothing is worse than no tool. Revisit if fitment notes get captured.*

### Customer agent

- Tools 1–5, read-only
- Tone: helpful, guides an unsure customer toward the right part
- **Never states or implies stock/availability** (revised 2026-08-26) — `search_parts` doesn't even return the status field to this agent. If asked "is it in stock," the answer is always "call or visit the shop to check."
- Never invents a part — if confidence is low, says so and suggests calling the shop

### Staff agent

Tools 1–5, plus:

6. **`get_location(part_id)`** → physical rack/shelf/bin
7. **`update_availability(part_id, status)`** → one-tap status change, writes to `verification_log`
8. **`get_overdue_categories()`** → which categories need re-verification

**Role enforcement**: staff-only tools are gated on the backend by JWT role. Never rely on the LLM to decide who may call what.

### Grounding rule (applies to both)

Every answer cites its source: the `raw_name` of the matched part, the attributes compared, or the retrieved document. If nothing is found with confidence, the agent says so rather than guessing.

---

## 8. Frontend

### Customer site (public, no login)

- **Landing page** — proper showcase design: hero, what the shop stocks, brands carried, contact/location, opening hours
- **Browse catalogue** — filter by category → sub-category, by brand, by vehicle make/model. Essential given thousands of SKUs; nobody scrolls a flat list
- **Part detail page** — raw name, brand, parsed attributes, cross-referenced alternatives. No availability/freshness shown (revised 2026-08-26) — a "call or visit to check" prompt instead
- **Chat assistant** — persistent widget: "Describe what you need, or enter a part number"

### Staff app (login required)

- **Fast search** — optimised for use while a customer is standing there: single search box, part number or description, results in one screen with location + availability
- **Verification queue** — overdue categories, one-tap status updates
- **Parse review** — low-confidence parsed rows flagged for correction
- **Catalogue management** — CRUD parts, brands, categories, cross-references, locations
- **Staff chat** — same agent, extra tools

---

## 9. Project Structure

```
/backend
  /src
    /routes
    /controllers
    /services       — fitment matching, cross-reference logic, availability
    /agent          — LLM orchestration, tool definitions, tool executors
    /rag            — embedding generation, vector search
    /ingestion      — price list parsing pipeline (batch scripts)
    /middleware     — auth, role guards, error handling
  /prisma           — schema.prisma, migrations, seed

/frontend
  /src
    /pages
      /public       — landing, browse, part detail
      /staff        — search, verification, management
    /components     — shared UI, chat widget
    /api
    /hooks
    /types
```

---

## 10. Build Order

1. **Phase 1 — Ingestion**: split into three milestones so there's a working checkpoint before the hardest part. Realistically 4–6 sessions, not one.
   - **1A — Setup + schema.** Git init, Docker Compose, TS backend, Prisma schema, hand-written migration for `CREATE EXTENSION vector` plus the HNSW and GIN indexes. *Deliberately boring, so 1B starts from a working system rather than a half-built one.*
     ✅ *Checkpoint:* `migrate reset` → `migrate dev` runs clean twice (catches the Prisma shadow-database extension trap early), schema browsable in Prisma Studio.
   - **1B — Ingestion pipeline.** The hard one. CSV → Zod → `staging_rows` verbatim (resumable: a crash at row 800 shouldn't cost 800 LLM calls) → normalize → lexicon/regex extractor → **LLM only on the unparsed residue**, batched and hash-cached → upsert `parts`, derive `vehicles` and `part_fitments`.
     ✅ *Checkpoint:* run it twice, get zero duplicates; report prints the rule / LLM / flagged split.
   - **1C — Embeddings, search, eval.** Batch embed, build HNSW *after* the bulk insert, search CLI, eval harness.
     ✅ *Checkpoint:* clean-machine run works end to end and prints a recall baseline.
2. **Phase 2 — Catalogue API + browse UI**: REST endpoints for categories/brands/parts, public browse pages with filtering
3. **Phase 3 — Search**: Part number lookup (exact + fuzzy), then embeddings + semantic description search. Test retrieval quality thoroughly before adding the LLM layer — **against the eval set built in Phase 1C**, not by vibes. With `part_documents` deferred, that eval set is the main evidence that retrieval works at all, so it is not optional.
4. **Phase 4 — Fitment logic**: Pure backend service comparing part vs vehicle attributes. Unit-test this properly — it's the logic the agent depends on
5. **Phase 5 — Customer agent**: LLM function calling wired to tools 1–5, chat widget, citation display
6. **Phase 6 — Staff auth + fast search**: JWT auth, role middleware, staff search screen
7. **Phase 7 — Availability & verification**: Status model, one-tap updates, verification log, overdue nudges
8. **Phase 8 — Staff agent + cross-references**: Staff-only tools, cross-reference data and UI. **⚠️ Scope is unknown until the §6 data question is answered** — "load an existing list" and "build a data-entry feature and populate it by hand" are very different amounts of work. Ask well before this phase.
9. **Phase 9 — Landing page + polish**: Proper showcase design, parse-review screen, deployment

---

## 11. Why This Is a Strong Portfolio Piece

- Built on **real messy data** from an actual shop, not invented demo data
- The ingestion pipeline (unstructured part names → structured attributes) is a real engineering problem — and it's **deterministic-first**: normalize, match against a lexicon of makes / models / chassis codes / positions, and send only the residue to an LLM. Cheaper, faster, reproducible, and it yields a number worth quoting: *"87% parsed by rules, 11% by LLM fallback, 2% flagged for review."* Far stronger than "I asked an LLM."
- **Hybrid retrieval** — exact match, fuzzy match, and vector search each used where they actually belong, rather than vector search everywhere
- **Measured, not asserted** — a checked-in eval set of 30–50 hand-labelled queries makes retrieval quality a number that moved (*"recall@5 from 0.62 to 0.89"*), not an adjective
- Two agents with different tool access and a real permission boundary
- Honest system design: the availability model acknowledges a real-world data-quality constraint and designs around it instead of pretending it away
- Grounded answers with citations — the agent refuses to guess

**Claim honestly.** See the note in §1: while `part_documents` is empty, this is hybrid retrieval over a structured catalogue, not RAG over documents. Someone technical will ask *"retrieval over what documents?"* — have a real answer, or don't make the claim.

---

## 12. Settled Decisions & Open Questions

*Recorded 2026-08-24, before any code was written.*

### Settled

| Decision | Choice | Why it's hard to reverse |
|---|---|---|
| Embedding model | Gemini, **768 dims** | Dimension is fixed in the migration; changing it means a migration plus a full re-embed |
| Price | Not shown to customers. **Stored verbatim as printed**, plus `price_as_of` from the price-list date | Amended 2026-08-24: capturing the date is a column now, a backfill later |
| Discount rules | **File-level metadata**, applied by business logic at display — never baked into the stored value | Baking it in would be unrecoverable |
| `source_key` | `(brand, normalized_code)` — **never** derived from parsed fields | Verified: 62/62 distinct on the GMB list; `(make, model, type)` is *not* unique |
| PDF ingestion | Extract **table cells**, never the flattened text line | A flattened row with a blank make silently mis-assigns the next token |
| Local Postgres | Docker Compose, `pgvector/pgvector:pg16`, port 5433 | — |
| `part_fitments` | **In Phase 1** | Deriving it later means backfilling every part |
| `cross_references` | **Cut** pending the data question | — |
| `part_documents` | **Deferred**, no source | Blocks the document-RAG claim, not the build |
| Ingestion strategy | Deterministic-first, LLM on the residue only | — |
| Parse confidence | From extractor provenance, never LLM self-report | — |

### Open questions — ask Dad / Uncle

1. **Does any written cross-reference list exist (OEM ↔ aftermarket), or is it all in your heads?** — *highest priority; determines the shape of agent tool 4 and the whole of Phase 8*
2. **Is the 25% discount universal, or customer-tier-specific?** Page 2 of the GMB list reads `** CREDIT LESS 25% - CASH LESS 25% **`. Commercial question, not an engineering one — the storage layering (above) keeps both answers open, so this does not block.
3. **Is there a size spec anywhere for U-joints (cross diameter × cap length)?** Without it, three parts fitting "Canter" cannot be told apart — see agent tool 3. A catalogue, a supplier sheet, or is it measured by hand at the counter?

*Answered 2026-08-24 by the GMB U-joint list — retained so the answers don't get re-asked:*

- ~~Does the price list have a **brand column**?~~ → **No.** Brand is file-level (`GMB`), and the header also names the *supplier* (Lakshman Motor House) — two different entities, do not conflate. Note **part type is not** file-level: 3 of 62 rows in a file titled `U/JOINT` are steering joints.
- ~~Do any rows list **multiple models**?~~ → **Yes**, and worse than expected: multiple models, chassis codes and engine codes, separated inconsistently by comma, slash *and* bare space. The parser emits many fitments per row.
- ~~What **date** is the current price list?~~ → `2024-07-26` for the GMB list. Per-file, so it is a column on the ingest run, not a constant. Also ~2 years stale, which is itself worth knowing.

### Known, unresolved, not blocking Phase 1

- **Category-level verification vs part-level data (§5).** "Overdue categories" means aggregating over thousands of parts, and nobody will one-tap them all, so a category never clears. Needs either an explicit *verification sweep* record or a percentage threshold. Resolve before Phase 7.
- **`attribute_schema` is unenforced.** Nothing validates `parts.attributes` against it — decide whether it's documentation or a runtime contract. Separately: normalize attribute *values* to a controlled vocabulary at ingestion, or `FR` / `FRONT` / `Front` will wreck the browse filters.
- **Public LLM endpoint has no rate limiting.** A no-login chat widget calling a paid API is an open invoice. Per-IP limits, a max message length, and a daily spend cap are required before Phase 9 deploys anything.
- **Agent observability.** Log every tool call with arguments and results, or debugging why the agent picked the wrong part is guesswork.
- **JWT storage** — httpOnly cookie is the right default; not yet decided in writing.

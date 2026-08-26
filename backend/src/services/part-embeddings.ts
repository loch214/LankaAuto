/**
 * Raw-SQL access to `part_embeddings` (Milestone 1C).
 *
 * Centralized here rather than inline in `embed-parts.ts` / `search-cli.ts`
 * / `run-eval.ts`, all three of which need it: Prisma has no vector type
 * (see the schema comment on `PartEmbedding.embedding` — `Unsupported`
 * means Prisma Client cannot read or write this column at all), so every
 * embedding read or write is `$queryRaw` / `$executeRaw`, and that SQL
 * should exist in exactly one place.
 */
import { randomUUID } from 'node:crypto';
import type { AvailabilityStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_NAME } from './embeddings.js';

/**
 * pgvector accepts this bracketed-CSV text form as input to a `vector`
 * column via an explicit `::vector` cast. Validated before formatting so a
 * NaN or Infinity from upstream fails loudly here rather than silently
 * corrupting a stored embedding (which pgvector's own parser would reject
 * at the SQL level anyway, but with a far less useful error).
 */
function toVectorLiteral(vec: readonly number[]): string {
  if (vec.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`expected a ${EMBEDDING_DIMENSIONS}-dim vector, got ${vec.length}`);
  }
  for (const v of vec) {
    if (!Number.isFinite(v)) throw new Error('embedding vector contains a non-finite value');
  }
  return `[${vec.join(',')}]`;
}

/**
 * `partId -> sourceText` for every part currently embedded under
 * `EMBEDDING_MODEL_NAME`. `embed-parts.ts` diffs against this so re-running
 * the script only re-embeds parts whose recipe output actually changed —
 * one query up front is cheaper than one per part.
 */
export async function loadExistingEmbeddingTexts(): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<{ part_id: string; source_text: string }[]>`
    SELECT part_id, source_text FROM part_embeddings WHERE model = ${EMBEDDING_MODEL_NAME}
  `;
  return new Map(rows.map((r) => [r.part_id, r.source_text]));
}

/**
 * Insert-or-update one part's embedding. `ON CONFLICT (part_id, model)`
 * relies on the unique index the schema already declares
 * (`@@unique([partId, model])` — see `check-db.ts` for why that index and
 * the HNSW index both matter and are checked separately).
 */
export async function upsertPartEmbedding(partId: string, vector: readonly number[], sourceText: string): Promise<void> {
  const literal = toVectorLiteral(vector);
  await prisma.$executeRaw`
    INSERT INTO part_embeddings (id, part_id, embedding, source_text, model, dim, created_at)
    VALUES (${randomUUID()}::uuid, ${partId}::uuid, ${literal}::vector, ${sourceText}, ${EMBEDDING_MODEL_NAME}, ${EMBEDDING_DIMENSIONS}, now())
    ON CONFLICT (part_id, model) DO UPDATE SET
      embedding = EXCLUDED.embedding,
      source_text = EXCLUDED.source_text,
      dim = EXCLUDED.dim,
      created_at = now()
  `;
}

export interface NearestPart {
  readonly partId: string;
  /** Cosine distance (0 = identical direction, 2 = opposite). Lower is better — this is a distance, not a similarity score. */
  readonly distance: number;
}

/**
 * Top-`limit` nearest parts to `queryVector` by cosine distance, using the
 * HNSW index (`<=>` matches the index's `vector_cosine_ops` — see the
 * migration comment; any other operator here would silently seq-scan
 * instead of erroring).
 */
export async function nearestParts(queryVector: readonly number[], limit: number): Promise<NearestPart[]> {
  if (limit <= 0) throw new Error(`limit must be positive, got ${limit}`);
  const literal = toVectorLiteral(queryVector);
  const rows = await prisma.$queryRaw<{ part_id: string; distance: number }[]>`
    SELECT part_id, (embedding <=> ${literal}::vector) AS distance
    FROM part_embeddings
    WHERE model = ${EMBEDDING_MODEL_NAME}
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ partId: r.part_id, distance: r.distance }));
}

export interface NearestPartDetail extends NearestPart {
  readonly partNumber: string | null;
  readonly rawName: string;
  readonly brandName: string | null;
  readonly categoryName: string;
  readonly availabilityStatus: AvailabilityStatus;
  readonly location: string | null;
  readonly lastVerifiedAt: Date | null;
  /** Staff/admin-only physical price-list citation — see the `Part` schema comment. Never surfaced to customer routes. */
  readonly folderLabel: string | null;
  readonly recordNumber: string | null;
}

/**
 * Same ranking as `nearestParts`, joined out to the fields a human (or an
 * eval script scoring by part number, since a UUID is not something anyone
 * hand-labels a query against) actually wants to see. Kept separate from
 * `nearestParts` rather than always joining, so a caller that only needs
 * ids — none exist yet, but a future agent tool doing its own downstream
 * lookup would — isn't forced to pay for the join.
 */
export async function nearestPartsWithDetails(queryVector: readonly number[], limit: number): Promise<NearestPartDetail[]> {
  if (limit <= 0) throw new Error(`limit must be positive, got ${limit}`);
  const literal = toVectorLiteral(queryVector);
  const rows = await prisma.$queryRaw<
    {
      part_id: string;
      part_number: string | null;
      raw_name: string;
      brand_name: string | null;
      category_name: string;
      availability_status: AvailabilityStatus;
      location: string | null;
      last_verified_at: Date | null;
      folder_label: string | null;
      record_number: string | null;
      distance: number;
    }[]
  >`
    SELECT
      p.id AS part_id,
      p.part_number,
      p.raw_name,
      b.name AS brand_name,
      c.name AS category_name,
      p.availability_status,
      p.location,
      p.last_verified_at,
      p.folder_label,
      p.record_number,
      (pe.embedding <=> ${literal}::vector) AS distance
    FROM part_embeddings pe
    JOIN parts p ON p.id = pe.part_id
    LEFT JOIN brands b ON b.id = p.brand_id
    JOIN categories c ON c.id = p.category_id
    WHERE pe.model = ${EMBEDDING_MODEL_NAME}
    ORDER BY pe.embedding <=> ${literal}::vector
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    partId: r.part_id,
    partNumber: r.part_number,
    rawName: r.raw_name,
    brandName: r.brand_name,
    categoryName: r.category_name,
    availabilityStatus: r.availability_status,
    location: r.location,
    lastVerifiedAt: r.last_verified_at,
    folderLabel: r.folder_label,
    recordNumber: r.record_number,
    distance: r.distance,
  }));
}

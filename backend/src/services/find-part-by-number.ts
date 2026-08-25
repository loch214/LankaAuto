/**
 * Tool 1 from PLAN.md §7: "Exact + fuzzy match on part number, including
 * cross-referenced equivalents." Cross-references are cut (PLAN.md §6), so
 * this covers the exact/fuzzy half only.
 *
 * Two tiers, not one merged ranked list. An exact code match (after
 * `normalizeCode` washes out whitespace/case) means the customer typed the
 * real code; a fuzzy match means "this looks similar," a fundamentally
 * weaker claim. Collapsing them would let a fuzzy neighbour outrank a true
 * hit by accident, so fuzzy only runs when the exact tier comes up empty.
 */
import type { AvailabilityStatus, Brand, Category, Part } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { normalizeCode } from '../ingest/normalize-code.js';

export type ExactPartMatch = Part & { brand: Brand | null; category: Category };

export interface FuzzyPartMatch {
  readonly partId: string;
  readonly partNumber: string;
  readonly rawName: string;
  readonly brandName: string | null;
  readonly categoryName: string;
  readonly availabilityStatus: AvailabilityStatus;
  readonly location: string | null;
  /** pg_trgm similarity, 0 (nothing shared) to 1 (identical). Higher is closer. */
  readonly similarity: number;
}

export interface FindPartByNumberResult {
  readonly exact: ExactPartMatch[];
  readonly fuzzy: FuzzyPartMatch[];
}

// pg_trgm's own `%` operator reads this from the `pg_trgm.similarity_threshold`
// GUC (default 0.3) at query time — session-level, ambient state a raw SQL
// string shouldn't silently depend on. Pinned here as an explicit constant and
// compared directly instead, so the threshold is visible in the code that
// uses it and doesn't drift if some other query in the process changes the GUC.
const FUZZY_SIMILARITY_THRESHOLD = 0.3;
const FUZZY_LIMIT = 5;

/**
 * `rawQuery` is normalized exactly the way ingestion normalized `part_number`
 * before storing it (`normalizeCode` — strip whitespace, uppercase), so
 * "gut 12" and "GUT12" hit the same exact-match row.
 */
export async function findPartByNumber(rawQuery: string): Promise<FindPartByNumberResult> {
  const code = normalizeCode(rawQuery);
  if (code === '') {
    return { exact: [], fuzzy: [] };
  }

  const exact = await prisma.part.findMany({
    where: { partNumber: code },
    include: { brand: true, category: true },
  });

  if (exact.length > 0) {
    return { exact, fuzzy: [] };
  }

  const fuzzy = await prisma.$queryRaw<
    {
      part_id: string;
      part_number: string;
      raw_name: string;
      brand_name: string | null;
      category_name: string;
      availability_status: AvailabilityStatus;
      location: string | null;
      similarity: number;
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
      similarity(p.part_number, ${code}) AS similarity
    FROM parts p
    LEFT JOIN brands b ON b.id = p.brand_id
    JOIN categories c ON c.id = p.category_id
    WHERE p.part_number IS NOT NULL
      AND similarity(p.part_number, ${code}) >= ${FUZZY_SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT ${FUZZY_LIMIT}
  `;

  return {
    exact: [],
    fuzzy: fuzzy.map((r) => ({
      partId: r.part_id,
      partNumber: r.part_number,
      rawName: r.raw_name,
      brandName: r.brand_name,
      categoryName: r.category_name,
      availabilityStatus: r.availability_status,
      location: r.location,
      similarity: r.similarity,
    })),
  };
}

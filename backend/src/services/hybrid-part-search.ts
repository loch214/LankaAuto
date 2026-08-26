/**
 * The "single search box, part number or description" behind the staff fast
 * search screen (PLAN.md §8) and, later, the chat agent's tools 1+2
 * (PLAN.md §7). Phase 3 (PLAN.md §10): "Part number lookup (exact + fuzzy),
 * then embeddings + semantic description search."
 *
 * Three tiers, tried in order, not blended into one score. A substring
 * match, a pg_trgm similarity, and a cosine distance are not commensurable
 * numbers — averaging them would produce a ranking nobody could explain, and
 * PLAN.md §7's grounding rule requires every answer to be able to say *why*
 * it matched. Each tier answers a different question:
 *
 *   1. exact-number  — "is this the part number, typed exactly (mod
 *      whitespace/case)?"
 *   2. fuzzy-number   — "is this close enough to be a typo of a real code?"
 *   3. semantic       — "does this describe a part in the catalogue?"
 *
 * The first tier to produce anything wins; a later tier only runs when every
 * earlier one comes up empty — the same fallback shape `findPartByNumber`
 * already uses internally for tier 1 → tier 2.
 */
import type { AvailabilityStatus } from '@prisma/client';
import { findPartByNumber } from './find-part-by-number.js';
import { semanticSearch } from './semantic-search.js';

export type SearchMatchType = 'exact-number' | 'fuzzy-number' | 'semantic';

export interface PartSearchHit {
  readonly partId: string;
  readonly partNumber: string | null;
  readonly rawName: string;
  readonly brandName: string | null;
  readonly categoryName: string;
  readonly availabilityStatus: AvailabilityStatus;
  readonly location: string | null;
  readonly lastVerifiedAt: Date | null;
  /** Staff/admin-only physical price-list citation. Only ever populated on this staff-gated endpoint — see `GET /parts/search`'s route comment. */
  readonly folderLabel: string | null;
  readonly recordNumber: string | null;
  readonly matchType: SearchMatchType;
}

export async function hybridPartSearch(query: string, limit: number): Promise<PartSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  const { exact, fuzzy } = await findPartByNumber(trimmed);

  if (exact.length > 0) {
    return exact.slice(0, limit).map((p) => ({
      partId: p.id,
      partNumber: p.partNumber,
      rawName: p.rawName,
      brandName: p.brand?.name ?? null,
      categoryName: p.category.name,
      availabilityStatus: p.availabilityStatus,
      location: p.location,
      lastVerifiedAt: p.lastVerifiedAt,
      folderLabel: p.folderLabel,
      recordNumber: p.recordNumber,
      matchType: 'exact-number' as const,
    }));
  }

  if (fuzzy.length > 0) {
    return fuzzy.slice(0, limit).map((m) => ({
      partId: m.partId,
      partNumber: m.partNumber,
      rawName: m.rawName,
      brandName: m.brandName,
      categoryName: m.categoryName,
      availabilityStatus: m.availabilityStatus,
      location: m.location,
      lastVerifiedAt: m.lastVerifiedAt,
      folderLabel: m.folderLabel,
      recordNumber: m.recordNumber,
      matchType: 'fuzzy-number' as const,
    }));
  }

  // Neither number tier found anything — fall through to a description
  // search. `q` might not be a part number at all ("brake pads for a hiace"),
  // and that's the normal case here, not an edge case.
  const semantic = await semanticSearch(trimmed, limit);
  return semantic.map((m) => ({
    partId: m.partId,
    partNumber: m.partNumber,
    rawName: m.rawName,
    brandName: m.brandName,
    categoryName: m.categoryName,
    availabilityStatus: m.availabilityStatus,
    location: m.location,
    lastVerifiedAt: m.lastVerifiedAt,
    folderLabel: m.folderLabel,
    recordNumber: m.recordNumber,
    matchType: 'semantic' as const,
  }));
}

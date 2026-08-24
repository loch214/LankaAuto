import type { Prisma } from '@prisma/client';
import { normalizeCode } from '../ingest/normalize-code.js';
import { normalizeName } from '../ingest/normalize-name.js';

/**
 * Escapes the characters Postgres `LIKE` treats as wildcards.
 *
 * Prisma's `contains` does NOT do this. It wraps the value in `%...%` and
 * parameterizes the result, which stops SQL injection but does nothing about
 * pattern injection: a customer typing `%` would match the entire catalogue and
 * `_` would match any single character. Both return confidently wrong results
 * with no error raised, which is the worst shape a bug can take here.
 *
 * Backslash is Postgres's default LIKE escape character, and it is escaped
 * first-class here (the character class covers it) so a typed backslash cannot
 * neutralise the escaping of whatever follows it.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Builds the `where` clause for a customer-facing part search.
 *
 * Two branches, OR'd, because the two things a customer types are different in
 * kind:
 *
 * - a **description** ("toyota hiace") → matched against `normalizedName`,
 *   through `normalizeName` so the query is transformed exactly the way the
 *   stored value was.
 * - a **part number** ("gut 12", "GUT12") → matched against `partNumber`
 *   through `normalizeCode`, which strips the whitespace the printed list is
 *   inconsistent about. Without this branch, a customer reading a code off a
 *   box exactly as printed would fail to find the part they are holding.
 *
 * A blank query returns an empty filter — "show everything" — rather than a
 * filter matching nothing. Deliberately NOT semantic search; embeddings are
 * Phase 3 (PLAN.md §10).
 */
export function buildPartSearchWhere(q: string | undefined): Prisma.PartWhereInput {
  const trimmed = q?.trim() ?? '';
  if (trimmed === '') return {};

  return {
    OR: [
      { normalizedName: { contains: escapeLikePattern(normalizeName(trimmed)) } },
      { partNumber: { contains: escapeLikePattern(normalizeCode(trimmed)) } },
    ],
  };
}

/**
 * Collapses a free-text name into the form stored in `Part.normalizedName`:
 * whitespace-collapsed and uppercased.
 *
 * Extracted so ingestion and search cannot drift apart. They must apply the
 * identical transform: the search side compares a user's typed query against
 * the value ingestion wrote, so any difference in how the two collapse
 * whitespace or handle case becomes a silent miss — a part that exists but
 * cannot be found, with no error anywhere to point at it.
 *
 * Unlike `normalizeCode`, this KEEPS internal spaces (collapsed to one).
 * "TOYOTA HIACE" is a phrase, not an identifier; stripping its spaces the way
 * codes are stripped would destroy word boundaries.
 */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

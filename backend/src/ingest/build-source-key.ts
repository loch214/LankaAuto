import { normalizeCode } from './normalize-code.js';

/**
 * Builds `Part.sourceKey` — see the field comment in `schema.prisma` for the
 * full rationale. Short version: `${brand ?? 'UNKNOWN'}|${normalizeCode(code)}`,
 * never derived from parsed fitment fields, because those are not unique
 * (`backend/docs/01-source-profile-gmb-ujoint.md` §9).
 *
 * `brand` is uppercased for the same reason `normalizeCode` uppercases the
 * code: a casing difference between two ingestion runs must not be able to
 * split one part into two rows.
 */
export function buildSourceKey(brand: string | null, code: string): string {
  const brandKey = brand === null ? 'UNKNOWN' : brand.trim().toUpperCase();
  return `${brandKey}|${normalizeCode(code)}`;
}

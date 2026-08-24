/**
 * Normalizes a manufacturer part code into the stable half of a `source_key`.
 *
 * `source_key` is `(brand, normalizeCode(code))`. It deliberately excludes the
 * file name and the price-list date, so re-ingesting an updated list from the
 * same brand UPDATES those parts instead of duplicating them. That is the
 * Milestone 1B checkpoint: run the pipeline twice, get zero duplicate parts.
 *
 * Rules are derived from real data, not invented. See
 * `backend/docs/01-source-profile-gmb-ujoint.md` §4 and §6.
 *
 * - **Strip all whitespace.** The source is inconsistent within a single file:
 *   `GUT11` vs `GUT 12`, `GUKO4` vs `GUKO 12`, `GUMZ 1` vs `GUMZ 9`. Leading
 *   and trailing whitespace also arrives from PDF cell extraction.
 *
 * - **Uppercase.** The one rule NOT evidenced by the GMB list, where all 62
 *   codes are already uppercase. Included because other price lists have
 *   different conventions, and a casing difference silently splitting one part
 *   into two is exactly the failure `source_key` exists to prevent.
 *
 * - **Preserve everything else**, punctuation included. `GU 7280/4` is one
 *   code; the `HD` in `GU 1000 HD` is part of the code. PLAN.md §4 originally
 *   said "strip punctuation noise" — that was wrong, and there are guard tests
 *   asserting it stays wrong.
 *
 * Idempotent: normalizing an already-normalized code returns it unchanged.
 * Ingestion re-runs over its own output, so a non-idempotent normalizer would
 * produce a different key on the second run and duplicate every part.
 *
 * NOTE: this normalizes the code only. It does NOT infer the vehicle make from
 * the code prefix. The prefix (`GUT`→Toyota, `GUN`→Nissan, …) looks like it
 * encodes make and nearly does, but breaks in the source file itself:
 * `GUMZ 1` is Mitsubishi while `GUMZ 3/9/12` are Mazda, and bare `GU` spans
 * five makes. See docs §8.
 */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

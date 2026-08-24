import { describe, it, expect } from 'vitest';
import { normalizeCode } from './normalize-code.js';
import {
  GMB_UJOINT_CODES,
  GMB_UJOINT_ROW_COUNT,
} from './__fixtures__/gmb-ujoint-codes.js';

describe('normalizeCode', () => {
  it('strips internal whitespace so GUT11 and GUT 12 share one shape', () => {
    expect(normalizeCode('GUT 12')).toBe('GUT12');
  });

  it('uppercases, so casing differences across price lists cannot split a part', () => {
    expect(normalizeCode('gut 12')).toBe('GUT12');
  });

  // --- Guard tests -------------------------------------------------------
  // These pass against the current implementation. They exist to fail if
  // someone adds punctuation stripping, which PLAN.md §4 originally called
  // for and which would be wrong here. See docs/01-source-profile §6.

  it('preserves a slash inside a code — GU 7280/4 is one code, not two', () => {
    expect(normalizeCode('GU 7280/4')).toBe('GU7280/4');
  });

  it('preserves an alphabetic suffix — the HD in GU 1000 HD is part of the code', () => {
    expect(normalizeCode('GU 1000 HD')).toBe('GU1000HD');
  });

  it('collapses leading and trailing whitespace from cell extraction', () => {
    expect(normalizeCode('  GUIS 52  ')).toBe('GUIS52');
  });
});

describe('source_key uniqueness (GMB U-joint list)', () => {
  // This is the Milestone 1B guarantee, encoded as a test rather than an
  // assumption: `source_key` is (brand, normalizeCode(code)), so if
  // normalization ever collapses two real codes together, two distinct parts
  // silently become one — an upsert would overwrite rather than insert, and
  // the "run twice, zero duplicates" checkpoint would pass for the wrong
  // reason.
  //
  // The expected value comes from the document (62 printed rows), not from
  // the code under test.

  it('has the row count the source document has', () => {
    expect(GMB_UJOINT_CODES).toHaveLength(GMB_UJOINT_ROW_COUNT);
  });

  it('normalizes 62 real codes to 62 distinct keys, with no collisions', () => {
    const seen = new Map<string, string[]>();
    for (const raw of GMB_UJOINT_CODES) {
      const key = normalizeCode(raw);
      seen.set(key, [...(seen.get(key) ?? []), raw]);
    }

    const collisions = [...seen.entries()].filter(([, raws]) => raws.length > 1);

    expect(collisions).toEqual([]);
    expect(seen.size).toBe(GMB_UJOINT_ROW_COUNT);
  });

  it('is idempotent — re-normalizing a key does not change it', () => {
    // Ingestion re-runs over already-normalized data; a non-idempotent
    // normalizer would produce a different source_key on the second run and
    // duplicate every part.
    for (const raw of GMB_UJOINT_CODES) {
      const once = normalizeCode(raw);
      expect(normalizeCode(once)).toBe(once);
    }
  });
});

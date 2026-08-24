import { describe, it, expect } from 'vitest';
import { buildSourceKey } from './build-source-key.js';
import { GMB_UJOINT_CODES, GMB_UJOINT_ROW_COUNT } from './__fixtures__/gmb-ujoint-codes.js';

describe('buildSourceKey', () => {
  it('combines brand and normalized code', () => {
    expect(buildSourceKey('GMB', 'GUT 12')).toBe('GMB|GUT12');
  });

  it('falls back to UNKNOWN when brand is null, matching Part.brandId nullability', () => {
    expect(buildSourceKey(null, 'GU 1638')).toBe('UNKNOWN|GU1638');
  });

  it('uppercases the brand so casing cannot split one brand into two keys', () => {
    expect(buildSourceKey('gmb', 'GUT11')).toBe(buildSourceKey('GMB', 'GUT11'));
  });
});

describe('buildSourceKey — uniqueness over the real corpus', () => {
  // Same guarantee as normalize-code.test.ts, one level up: this is the
  // actual column value that gets a UNIQUE constraint in Postgres.
  it('produces 62 distinct keys for one brand, 62 real codes', () => {
    const keys = new Set(GMB_UJOINT_CODES.map((code) => buildSourceKey('GMB', code)));
    expect(keys.size).toBe(GMB_UJOINT_ROW_COUNT);
  });
});

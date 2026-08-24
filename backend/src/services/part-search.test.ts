import { describe, it, expect } from 'vitest';
import { escapeLikePattern, buildPartSearchWhere, buildPartWhere } from './part-search.js';

describe('escapeLikePattern', () => {
  // The bug this exists to prevent: Prisma's `contains` interpolates the term
  // straight into a LIKE pattern without escaping. A customer typing "%" would
  // otherwise match every part in the catalogue, and "_" would match any single
  // character — silently wrong results, not an error.
  it('escapes the LIKE wildcards % and _', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
    expect(escapeLikePattern('GU_12')).toBe('GU\\_12');
  });

  it('escapes the backslash itself, so it cannot smuggle in an escape', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLikePattern('TOYOTA HIACE')).toBe('TOYOTA HIACE');
  });

  it('leaves the / in a real code alone — GU 7280/4 is one part number', () => {
    expect(escapeLikePattern('GU 7280/4')).toBe('GU 7280/4');
  });
});

describe('buildPartSearchWhere', () => {
  it('returns an empty filter for a missing or blank query, rather than matching nothing', () => {
    expect(buildPartSearchWhere(undefined)).toEqual({});
    expect(buildPartSearchWhere('   ')).toEqual({});
  });

  it('searches the name case-insensitively by matching the stored uppercase form', () => {
    const where = buildPartSearchWhere('hiace');
    expect(where.OR).toContainEqual({ normalizedName: { contains: 'HIACE' } });
  });

  it('collapses whitespace the same way ingestion did, so spacing cannot cause a silent miss', () => {
    const where = buildPartSearchWhere('  toyota   hiace ');
    expect(where.OR).toContainEqual({ normalizedName: { contains: 'TOYOTA HIACE' } });
  });

  it('also matches the part number through normalizeCode, so "gut 12" finds GUT12', () => {
    const where = buildPartSearchWhere('gut 12');
    expect(where.OR).toContainEqual({ partNumber: { contains: 'GUT12' } });
  });

  it('escapes wildcards on both branches, not just the name one', () => {
    const where = buildPartSearchWhere('%');
    expect(where.OR).toEqual([
      { normalizedName: { contains: '\\%' } },
      { partNumber: { contains: '\\%' } },
    ]);
  });
});

describe('buildPartWhere', () => {
  it('returns an empty filter when nothing is set', () => {
    expect(buildPartWhere({})).toEqual({});
  });

  it('AND-combines q with a category filter, not OR — both must hold', () => {
    const where = buildPartWhere({ q: 'hiace', categorySlug: 'u-joints' });
    expect(where.AND).toContainEqual({ category: { slug: 'u-joints' } });
    expect(where.AND).toContainEqual({
      OR: [
        { normalizedName: { contains: 'HIACE' } },
        { partNumber: { contains: 'HIACE' } },
      ],
    });
  });

  it('filters by brandId directly', () => {
    const where = buildPartWhere({ brandId: 'brand-1' });
    expect(where.AND).toContainEqual({ brandId: 'brand-1' });
  });

  it('filters by vehicle make and model via the fitments join, uppercased', () => {
    const where = buildPartWhere({ vehicleMake: 'toyota', vehicleModel: 'hiace' });
    expect(where.AND).toContainEqual({
      fitments: { some: { vehicle: { make: 'TOYOTA', model: 'HIACE' } } },
    });
  });

  it('allows vehicle make alone, without requiring a model', () => {
    const where = buildPartWhere({ vehicleMake: 'toyota' });
    expect(where.AND).toContainEqual({
      fitments: { some: { vehicle: { make: 'TOYOTA' } } },
    });
  });

  it('does not add an empty category/brand/vehicle condition when only q is set', () => {
    const where = buildPartWhere({ q: 'hiace' });
    expect(where.AND).toHaveLength(1);
  });
});

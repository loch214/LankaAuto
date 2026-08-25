import { describe, it, expect, afterAll } from 'vitest';
import { disconnect } from '../lib/prisma.js';
import { findPartByNumber } from './find-part-by-number.js';

// Runs against the real dev database, same as `routes/parts.test.ts` — the
// pg_trgm GIN index this exercises can't be meaningfully faked with a mocked
// Prisma client. Expects the GMB U-joint list (Milestone 1B) already
// ingested; `GU1000HD` is one of its real codes.
describe('findPartByNumber', () => {
  afterAll(async () => {
    await disconnect();
  });

  it('finds an exact match regardless of spacing or case', async () => {
    const result = await findPartByNumber('gu 1000 hd');
    expect(result.exact.some((p) => p.partNumber === 'GU1000HD')).toBe(true);
    expect(result.fuzzy).toEqual([]);
  });

  it('returns nothing in either tier for a blank query', async () => {
    const result = await findPartByNumber('   ');
    expect(result.exact).toEqual([]);
    expect(result.fuzzy).toEqual([]);
  });

  it('falls back to a fuzzy match when there is no exact hit', async () => {
    // One character off from the real code GU1000HD — not an exact match,
    // close enough that pg_trgm should still surface it.
    const result = await findPartByNumber('GU1000H');
    expect(result.exact).toEqual([]);
    expect(result.fuzzy.some((m) => m.partNumber === 'GU1000HD')).toBe(true);
    for (const match of result.fuzzy) {
      expect(match.similarity).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('fuzzy results are sorted by similarity, closest first', async () => {
    const result = await findPartByNumber('GU1000H');
    for (let i = 1; i < result.fuzzy.length; i++) {
      expect(result.fuzzy[i - 1]!.similarity).toBeGreaterThanOrEqual(result.fuzzy[i]!.similarity);
    }
  });

  it('returns an empty fuzzy list, not garbage matches, for a code unlike anything in the catalogue', async () => {
    const result = await findPartByNumber('ZZZZZZZZZZ9999');
    expect(result.exact).toEqual([]);
    expect(result.fuzzy).toEqual([]);
  });
});

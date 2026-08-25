import { describe, expect, it } from 'vitest';
import { meanRecallAtK, recallAtK } from './recall.js';

describe('recallAtK', () => {
  it('is 1 when every relevant id is within the top k', () => {
    expect(recallAtK(['a', 'b', 'c'], ['a', 'c'], 3)).toBe(1);
  });

  it('is 0 when no relevant id is within the top k', () => {
    expect(recallAtK(['x', 'y', 'z'], ['a'], 3)).toBe(0);
  });

  it('is a fraction when only some relevant ids are found', () => {
    expect(recallAtK(['a', 'x', 'y'], ['a', 'b'], 3)).toBe(0.5);
  });

  // The entire point of "@k": a relevant id ranked outside the cutoff must
  // not count, or the metric can't distinguish a good ranker from a lucky
  // one that just returns everything.
  it('ignores a relevant id ranked beyond k', () => {
    expect(recallAtK(['a', 'x', 'y', 'z', 'b'], ['a', 'b'], 3)).toBe(0.5);
  });

  it('a single-id query counts as a hit or a total miss, never a fraction', () => {
    expect(recallAtK(['a', 'b', 'c'], ['b'], 5)).toBe(1);
    expect(recallAtK(['a', 'c'], ['b'], 5)).toBe(0);
  });

  it('does not exceed 1 when retrievedIds contains a duplicate', () => {
    expect(recallAtK(['a', 'a', 'a'], ['a'], 3)).toBe(1);
  });

  it('throws on an empty relevantIds — an unlabeled query is a data bug, not a score', () => {
    expect(() => recallAtK(['a', 'b'], [], 3)).toThrow();
  });

  it('throws on a non-positive k', () => {
    expect(() => recallAtK(['a'], ['a'], 0)).toThrow();
    expect(() => recallAtK(['a'], ['a'], -1)).toThrow();
  });

  it('handles retrievedIds shorter than k', () => {
    expect(recallAtK(['a'], ['a', 'b'], 10)).toBe(0.5);
  });
});

describe('meanRecallAtK', () => {
  it('averages recall across queries', () => {
    const mean = meanRecallAtK(
      [
        { retrievedIds: ['a', 'b'], relevantIds: ['a'] }, // recall 1
        { retrievedIds: ['x', 'y'], relevantIds: ['a'] }, // recall 0
      ],
      2,
    );
    expect(mean).toBe(0.5);
  });

  it('throws on an empty result set rather than returning NaN', () => {
    expect(() => meanRecallAtK([], 5)).toThrow();
  });
});

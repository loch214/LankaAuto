import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chunk,
  EMBEDDING_DIMENSIONS,
  EmbeddingConfigError,
  EmbeddingRequestError,
  embedTexts,
  l2Normalize,
} from './embeddings.js';

describe('l2Normalize', () => {
  it('scales a vector to unit magnitude', () => {
    const v = l2Normalize([3, 4]);
    const mag = Math.sqrt(v[0]! ** 2 + v[1]! ** 2);
    expect(mag).toBeCloseTo(1, 10);
  });

  it('preserves direction (ratio between components)', () => {
    const v = l2Normalize([3, 4]);
    expect(v[0]! / v[1]!).toBeCloseTo(3 / 4, 10);
  });

  // A theoretical edge, not one Gemini should ever actually return — but a
  // division by zero here would produce NaN in every downstream stored
  // vector rather than a loud error, so it gets a defined answer instead.
  it('returns the zero vector unchanged instead of dividing by zero', () => {
    expect(l2Normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('chunk', () => {
  it('splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one chunk when size exceeds the array length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('returns an empty array for an empty input', () => {
    expect(chunk([], 5)).toEqual([]);
  });

  it('throws rather than silently no-op-ing on a non-positive size', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow();
    expect(() => chunk([1, 2, 3], -1)).toThrow();
  });
});

describe('embedTexts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws EmbeddingConfigError when no API key is available', async () => {
    // '' rather than `undefined`: the parameter defaults to
    // `process.env['GEMINI_API_KEY']` when the caller omits it, and JS
    // default parameters also apply for an explicit `undefined` argument —
    // so `undefined` here would pick up whatever key .env has (this repo
    // keeps a placeholder value there), not exercise the "missing" path.
    await expect(embedTexts(['hello'], 'RETRIEVAL_DOCUMENT', '')).rejects.toBeInstanceOf(
      EmbeddingConfigError,
    );
  });

  it('returns an empty array without calling fetch for an empty text list', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await embedTexts([], 'RETRIEVAL_DOCUMENT', 'fake-key');
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the configured task type and dimension, and normalizes the response', async () => {
    const fakeVector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 1);
    let capturedBody: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ embeddings: [{ values: fakeVector }] }), { status: 200 });
      }),
    );

    const [vec] = await embedTexts(['a query'], 'RETRIEVAL_QUERY', 'fake-key');

    expect((capturedBody as { requests: { taskType: string; outputDimensionality: number }[] }).requests[0]).toMatchObject(
      { taskType: 'RETRIEVAL_QUERY', outputDimensionality: EMBEDDING_DIMENSIONS },
    );
    expect(vec).toHaveLength(EMBEDDING_DIMENSIONS);
    const mag = Math.sqrt(vec!.reduce((s, x) => s + x * x, 0));
    expect(mag).toBeCloseTo(1, 6);
  });

  it('retries on a 500 and eventually succeeds', async () => {
    const fakeVector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 1);
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls < 2) return new Response('server error', { status: 500 });
        return new Response(JSON.stringify({ embeddings: [{ values: fakeVector }] }), { status: 200 });
      }),
    );

    const result = await embedTexts(['x'], 'RETRIEVAL_DOCUMENT', 'fake-key');
    expect(result).toHaveLength(1);
    expect(calls).toBe(2);
  }, 10_000);

  it('throws EmbeddingRequestError on a non-retryable 4xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad request', { status: 400 })),
    );
    await expect(embedTexts(['x'], 'RETRIEVAL_DOCUMENT', 'fake-key')).rejects.toBeInstanceOf(
      EmbeddingRequestError,
    );
  });

  it('throws EmbeddingRequestError when the API returns the wrong dimension', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ embeddings: [{ values: [1, 2, 3] }] }), { status: 200 })),
    );
    await expect(embedTexts(['x'], 'RETRIEVAL_DOCUMENT', 'fake-key')).rejects.toBeInstanceOf(
      EmbeddingRequestError,
    );
  });

  it('batches more than 50 texts into multiple requests', async () => {
    const fakeVector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 1);
    const calls: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { requests: unknown[] };
        calls.push(body.requests.length);
        return new Response(
          JSON.stringify({ embeddings: body.requests.map(() => ({ values: fakeVector })) }),
          { status: 200 },
        );
      }),
    );

    const texts = Array.from({ length: 120 }, (_, i) => `text ${i}`);
    const result = await embedTexts(texts, 'RETRIEVAL_DOCUMENT', 'fake-key');
    expect(result).toHaveLength(120);
    expect(calls).toEqual([50, 50, 20]);
  });
});

/**
 * Gemini embedding client (Milestone 1C).
 *
 * Model and dimension are locked in — see CLAUDE.md's "standing decisions":
 * `gemini-embedding-001` truncated to 768 dims, matching the `vector(768)`
 * column `PartEmbedding.embedding` was migrated with. Changing either means
 * a migration plus a full re-embed, not a config tweak.
 *
 * Plain `fetch` against the REST API, not the `@google/genai` SDK: one
 * endpoint, no auth flow beyond an API key in the query string, and this
 * project otherwise keeps dependencies to what it actually needs.
 */

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIM = 768;
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini's batchEmbedContents caps a single request at 100 items. Staying
 * well under that leaves room for the request body itself (each item is a
 * full part's worth of prose) without hitting a payload-size limit too.
 */
const MAX_BATCH = 50;

const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Asymmetric embedding: a catalogue entry and a customer's search phrase are
 * different kinds of text even when they describe the same part, and Gemini's
 * embedding model was trained to place them well only when told which is
 * which. Using the wrong task type doesn't error — it just quietly produces
 * worse retrieval, the same failure mode as the HNSW opclass mismatch this
 * project has already guarded against once (`check-db.ts`).
 */
export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export class EmbeddingConfigError extends Error {}
export class EmbeddingRequestError extends Error {}

/**
 * L2-normalizes a vector so its magnitude is 1.
 *
 * pgvector's `<=>` cosine-distance operator is magnitude-invariant on its
 * own, so this isn't required for correctness. It's here because Gemini's
 * documented behavior is that only the full 3072-dim output is
 * pre-normalized — a truncated (Matryoshka) output like this project's 768
 * dims is not guaranteed to be, and every vector in the index should live in
 * the same normalized space rather than some rows quietly not.
 */
export function l2Normalize(vec: readonly number[]): number[] {
  let sumSquares = 0;
  for (const v of vec) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return vec.slice();
  return vec.map((v) => v / norm);
}

/** Splits an array into chunks of at most `size`. `size <= 0` throws — silently returning `[]` would hide a caller bug as an empty embed run. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error(`chunk size must be positive, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BatchEmbedResponse {
  embeddings?: { values?: number[] }[];
}

async function embedBatch(
  texts: readonly string[],
  taskType: EmbeddingTaskType,
  apiKey: string,
  attempt = 1,
): Promise<number[][]> {
  const url = `${API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`;
  const body = {
    requests: texts.map((text) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBEDDING_DIM,
    })),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
    const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    await sleep(delay);
    return embedBatch(texts, taskType, apiKey, attempt + 1);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new EmbeddingRequestError(`Gemini embed request failed: ${res.status} ${res.statusText} — ${detail}`);
  }

  const data = (await res.json()) as BatchEmbedResponse;
  const embeddings = data.embeddings;
  if (embeddings === undefined || embeddings.length !== texts.length) {
    throw new EmbeddingRequestError(
      `Gemini returned ${embeddings?.length ?? 0} embeddings for ${texts.length} requested texts`,
    );
  }

  return embeddings.map((e, i) => {
    const values = e.values;
    if (values === undefined || values.length !== EMBEDDING_DIM) {
      throw new EmbeddingRequestError(
        `embedding ${i} has ${values?.length ?? 0} dimensions, expected ${EMBEDDING_DIM}`,
      );
    }
    return l2Normalize(values);
  });
}

/**
 * Embeds a list of texts, batched and retried, in the order given.
 *
 * `apiKey` defaults to `GEMINI_API_KEY` rather than requiring every caller
 * to pass it, but stays a parameter so tests can supply a fake key without
 * touching `process.env`.
 */
export async function embedTexts(
  texts: readonly string[],
  taskType: EmbeddingTaskType,
  apiKey: string | undefined = process.env['GEMINI_API_KEY'],
): Promise<number[][]> {
  if (apiKey === undefined || apiKey.length === 0) {
    throw new EmbeddingConfigError('GEMINI_API_KEY is not set');
  }
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (const batch of chunk(texts, MAX_BATCH)) {
    out.push(...(await embedBatch(batch, taskType, apiKey)));
  }
  return out;
}

export const EMBEDDING_MODEL_NAME = EMBEDDING_MODEL;
export const EMBEDDING_DIMENSIONS = EMBEDDING_DIM;

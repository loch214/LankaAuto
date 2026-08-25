/**
 * Query-side half of semantic search (Milestone 1C). `nearestPartsWithDetails`
 * in `part-embeddings.ts` does the ranking; this just embeds the query text
 * first — kept separate so both `search-cli.ts` and `run-eval.ts` share one
 * definition of "how a query becomes a vector", rather than each embedding
 * it slightly differently.
 */
import { embedTexts } from './embeddings.js';
import { nearestPartsWithDetails, type NearestPartDetail } from './part-embeddings.js';

export async function semanticSearch(query: string, limit: number): Promise<NearestPartDetail[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error('semanticSearch: query is empty');
  }

  // RETRIEVAL_QUERY, not RETRIEVAL_DOCUMENT — see embeddings.ts. The query
  // and the catalogue text it's compared against are embedded with
  // deliberately different task types.
  const [vector] = await embedTexts([trimmed], 'RETRIEVAL_QUERY');
  if (vector === undefined) {
    throw new Error('semanticSearch: embedTexts returned no vector for the query');
  }

  return nearestPartsWithDetails(vector, limit);
}

/**
 * Recall@k: of the parts a query *should* return, what fraction appear in
 * the top k results actually returned?
 *
 * Pure and DB-free on purpose — PLAN.md §3 requires retrieval to be measured
 * against a checked-in eval set, and a metric you can't unit-test is one you
 * can't fully trust either. `run-eval.ts` is the thin, live-DB wrapper
 * around this.
 */

/**
 * @param retrievedIds Result ids in rank order, best match first. Only the
 *   first `k` are considered — a relevant id at rank 8 does not count
 *   toward recall@5, which is the point of the metric.
 * @param relevantIds The ids that count as a correct answer for this query.
 *   An empty `relevantIds` throws rather than returning a silent 0 or 1: it
 *   means the eval set itself has an unlabeled query, which is a bug in the
 *   eval data, not a retrieval result worth scoring.
 */
export function recallAtK(retrievedIds: readonly string[], relevantIds: readonly string[], k: number): number {
  if (relevantIds.length === 0) {
    throw new Error('recallAtK: relevantIds is empty — this query has no labeled correct answer');
  }
  if (k <= 0) {
    throw new Error(`recallAtK: k must be positive, got ${k}`);
  }

  const relevantSet = new Set(relevantIds);
  const topK = retrievedIds.slice(0, k);

  // Distinct hits, not raw count: a duplicate id in `retrievedIds` (or a
  // duplicate in `relevantIds`, already collapsed by the Set above) must not
  // let recall exceed 1.
  const distinctHits = new Set(topK.filter((id) => relevantSet.has(id))).size;

  return distinctHits / relevantSet.size;
}

export interface EvalQueryResult {
  readonly retrievedIds: readonly string[];
  readonly relevantIds: readonly string[];
}

/** Mean recall@k across a set of queries — the single number PLAN.md §11's portfolio claim ("recall@5 from 0.62 to 0.89") refers to. */
export function meanRecallAtK(results: readonly EvalQueryResult[], k: number): number {
  if (results.length === 0) {
    throw new Error('meanRecallAtK: no queries to average over');
  }
  const total = results.reduce((sum, r) => sum + recallAtK(r.retrievedIds, r.relevantIds, k), 0);
  return total / results.length;
}

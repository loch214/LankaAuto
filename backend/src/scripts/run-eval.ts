/**
 * Milestone 1C checkpoint: "prints a recall baseline."
 *
 * Runs every query in the checked-in eval set (`src/eval/queries.ts`)
 * through semantic search and reports recall@5 and recall@10 per query plus
 * the mean across the set — the number PLAN.md §11's portfolio claim
 * ("recall@5 from 0.62 to 0.89") refers to. This first run establishes the
 * baseline that number is a delta from; there is nothing to compare against
 * yet.
 *
 * Run: npm run eval
 */
import { prisma, disconnect } from '../lib/prisma.js';
import { EVAL_QUERIES } from '../eval/queries.js';
import { meanRecallAtK, recallAtK } from '../eval/recall.js';
import { semanticSearch } from '../services/semantic-search.js';

const RETRIEVE_LIMIT = 10;
const REPORT_KS = [5, 10] as const;

async function verifyExpectedPartNumbersExist(): Promise<string[]> {
  const allExpected = new Set(EVAL_QUERIES.flatMap((q) => q.expectedPartNumbers));
  const found = await prisma.part.findMany({
    where: { partNumber: { in: [...allExpected] } },
    select: { partNumber: true },
  });
  const foundSet = new Set(found.map((p) => p.partNumber));
  return [...allExpected].filter((pn) => !foundSet.has(pn));
}

async function main(): Promise<void> {
  const missing = await verifyExpectedPartNumbersExist();
  if (missing.length > 0) {
    // A typo in the eval set itself would otherwise just silently depress
    // every recall number for the queries that reference it, with no clue
    // why — this fails loudly and specifically instead.
    throw new Error(
      `eval set references part number(s) not found in the database: ${missing.join(', ')}. ` +
        `Fix src/eval/queries.ts, or re-run ingestion if the catalogue changed.`,
    );
  }

  const embeddedCount = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM part_embeddings`;
  const count = Number(embeddedCount[0]?.count ?? 0n);
  if (count === 0) {
    throw new Error('No parts are embedded yet. Run `npm run embed:parts` first.');
  }

  console.log(`\n${EVAL_QUERIES.length} queries, ${count} parts embedded\n`);

  const perQuery: { id: string; query: string; retrievedPartNumbers: string[]; recallByK: Record<number, number> }[] = [];

  for (const q of EVAL_QUERIES) {
    const results = await semanticSearch(q.query, RETRIEVE_LIMIT);
    const retrievedPartNumbers = results.map((r) => r.partNumber ?? '(no code)');

    const recallByK: Record<number, number> = {};
    for (const k of REPORT_KS) {
      recallByK[k] = recallAtK(retrievedPartNumbers, q.expectedPartNumbers, k);
    }

    perQuery.push({ id: q.id, query: q.query, retrievedPartNumbers, recallByK });
  }

  const idWidth = Math.max(...perQuery.map((p) => p.id.length));
  const queryWidth = Math.min(48, Math.max(...perQuery.map((p) => p.query.length)));

  for (const p of perQuery) {
    const scores = REPORT_KS.map((k) => `r@${k}=${p.recallByK[k]?.toFixed(2)}`).join('  ');
    const displayQuery = p.query.length > queryWidth ? p.query.slice(0, queryWidth - 1) + '…' : p.query.padEnd(queryWidth);
    console.log(`  ${p.id.padEnd(idWidth)}  "${displayQuery}"  ${scores}`);
  }

  console.log('');
  for (const k of REPORT_KS) {
    const mean = meanRecallAtK(
      EVAL_QUERIES.map((q, i) => ({
        retrievedIds: perQuery[i]?.retrievedPartNumbers ?? [],
        relevantIds: q.expectedPartNumbers,
      })),
      k,
    );
    console.log(`  mean recall@${k} = ${mean.toFixed(4)}`);
  }
  console.log('');
}

main()
  .catch((err: unknown) => {
    console.error('\n run-eval crashed:\n', err);
    process.exitCode = 1;
  })
  .finally(disconnect);

/**
 * Manual poke-at-it tool for semantic search (Milestone 1C checkpoint: "search
 * CLI"). Not a test — `run-eval.ts` is the thing that actually measures
 * quality — this is for eyeballing what a specific query returns while
 * tuning the embedding recipe or debugging a surprising eval result.
 *
 * Run: npm run search -- "u joint for a toyota corolla" [limit]
 */
import { disconnect } from '../lib/prisma.js';
import { semanticSearch } from '../services/semantic-search.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const query = args[0];
  if (query === undefined || query.trim().length === 0) {
    console.error('Usage: npm run search -- "<query text>" [limit]');
    process.exitCode = 1;
    return;
  }
  const limit = args[1] !== undefined ? Number(args[1]) : 10;
  if (!Number.isFinite(limit) || limit <= 0) {
    console.error(`limit must be a positive number, got ${args[1]}`);
    process.exitCode = 1;
    return;
  }

  const results = await semanticSearch(query, limit);

  console.log(`\nquery: "${query}"\n`);
  if (results.length === 0) {
    console.log('  (no parts are embedded yet — run `npm run embed:parts` first)');
    return;
  }

  const codeWidth = Math.max(...results.map((r) => (r.partNumber ?? '(no code)').length));
  for (const [i, r] of results.entries()) {
    const rank = String(i + 1).padStart(2, ' ');
    const code = (r.partNumber ?? '(no code)').padEnd(codeWidth, ' ');
    const brand = r.brandName ?? '(no brand)';
    console.log(`  ${rank}. ${code}  d=${r.distance.toFixed(4)}  ${brand} — ${r.categoryName} — ${r.rawName}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error('\n search-cli crashed:\n', err);
    process.exitCode = 1;
  })
  .finally(disconnect);

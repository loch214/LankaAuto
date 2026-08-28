/**
 * Latency benchmark for the customer chat agent (`npm run bench:chat`).
 *
 * Written because the first attempt at diagnosing "the chat is too slow"
 * inferred the cause from end-to-end response times, which is exactly the
 * mistake Lecture 06 p42 warns about: *measure each step* (retrieve →
 * generate), don't guess which one dominates. This script times the stages
 * independently so the answer is data, not a hypothesis:
 *
 *   - retrieval, exact-number tier   (indexed lookup, no network)
 *   - retrieval, semantic tier       (Gemini embedding call + pgvector HNSW)
 *   - one LLM round trip            (Groq, no tools)
 *   - the full agent turn           (N sequential LLM round trips + tools)
 *
 * Not a test — it makes real network calls and needs the dev DB up, which is
 * why it lives in scripts/ and not in the vitest suite (same rule as
 * `search-cli.ts` and `run-eval.ts`).
 */
import { hybridPartSearch } from '../services/hybrid-part-search.js';
import { semanticSearch } from '../services/semantic-search.js';
import { findPartByNumber } from '../services/find-part-by-number.js';
import { embedTexts } from '../services/embeddings.js';
import { generateTurn } from '../services/agent/groq-client.js';
import { runCustomerAgentTurn } from '../services/agent/customer-agent.js';
import { disconnect } from '../lib/prisma.js';

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    const result = await fn();
    console.log(`  ${label.padEnd(42)} ${(performance.now() - started).toFixed(0).padStart(7)} ms`);
    return result;
  } catch (err) {
    console.log(`  ${label.padEnd(42)} ${'FAILED'.padStart(7)}    ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`);
    throw err;
  }
}

async function main(): Promise<void> {
  const exactQuery = 'GUT12';
  const semanticQuery = 'engine oil';

  console.log('\n=== 1. RETRIEVAL ONLY (no LLM) ===');
  await time(`findPartByNumber("${exactQuery}") [exact tier]`, () => findPartByNumber(exactQuery));
  await time(`embedTexts("${semanticQuery}") [Gemini embed]`, () => embedTexts([semanticQuery], 'RETRIEVAL_QUERY'));
  await time(`semanticSearch("${semanticQuery}") [embed+pgvector]`, () => semanticSearch(semanticQuery, 5));
  await time(`hybridPartSearch("${exactQuery}") [full, exact]`, () => hybridPartSearch(exactQuery, 5));
  await time(`hybridPartSearch("${semanticQuery}") [full, semantic]`, () => hybridPartSearch(semanticQuery, 5));

  console.log('\n=== 2. ONE LLM ROUND TRIP (Groq, no tools) ===');
  for (let i = 1; i <= 3; i++) {
    await time(`generateTurn (run ${i})`, () =>
      generateTurn([{ role: 'user', parts: [{ text: 'Say OK.' }] }], [], 'You are terse. Reply with one word.'),
    );
  }

  console.log('\n=== 3. FULL AGENT TURN (end to end) ===');
  for (const q of [exactQuery, semanticQuery, 'u joint for a toyota hiace', 'hello']) {
    const result = await time(`runCustomerAgentTurn("${q}")`, () =>
      runCustomerAgentTurn([{ role: 'user', parts: [{ text: q }] }]),
    );
    console.log(`      → ${result.reply.replace(/\n/g, ' ').slice(0, 110)}`);
  }

  console.log('');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnect());

/**
 * Milestone 1C — embed every part into `part_embeddings`.
 *
 * Idempotent and incremental: a part is re-embedded only if
 * `buildEmbeddingText`'s output for it has changed since the last run, or it
 * has never been embedded. Comparing against the stored `source_text`
 * (rather than, say, an `updatedAt` timestamp) means the check survives
 * unrelated writes to a part and is exact rather than a heuristic.
 *
 * Run: npm run embed:parts
 */
import { prisma, disconnect } from '../lib/prisma.js';
import { buildEmbeddingText, parseEmbeddingAttributes } from '../ingest/build-embedding-text.js';
import { embedTexts, EMBEDDING_MODEL_NAME } from '../services/embeddings.js';
import { loadExistingEmbeddingTexts, upsertPartEmbedding } from '../services/part-embeddings.js';

async function main(): Promise<void> {
  const parts = await prisma.part.findMany({
    include: {
      brand: true,
      category: true,
      fitments: { include: { vehicle: true } },
    },
    orderBy: { partNumber: 'asc' },
  });

  const existing = await loadExistingEmbeddingTexts();

  const toEmbed: { partId: string; text: string }[] = [];
  let unchanged = 0;

  for (const part of parts) {
    const text = buildEmbeddingText({
      rawName: part.rawName,
      partNumber: part.partNumber,
      brandName: part.brand?.name ?? null,
      categoryName: part.category.name,
      attributes: parseEmbeddingAttributes(part.attributes),
      fitmentVehicles: part.fitments.map((f) => ({
        make: f.vehicle.make,
        model: f.vehicle.model,
        chassisCode: f.vehicle.chassisCode,
      })),
    });

    if (existing.get(part.id) === text) {
      unchanged += 1;
      continue;
    }
    toEmbed.push({ partId: part.id, text });
  }

  console.log(
    `${parts.length} parts total — ${unchanged} unchanged, ${toEmbed.length} to embed (model ${EMBEDDING_MODEL_NAME})`,
  );

  if (toEmbed.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const vectors = await embedTexts(
    toEmbed.map((t) => t.text),
    'RETRIEVAL_DOCUMENT',
  );

  for (let i = 0; i < toEmbed.length; i++) {
    const item = toEmbed[i];
    const vector = vectors[i];
    if (item === undefined || vector === undefined) {
      throw new Error(`embedTexts returned ${vectors.length} vectors for ${toEmbed.length} requested texts`);
    }
    await upsertPartEmbedding(item.partId, vector, item.text);
  }

  console.log(`Embedded ${toEmbed.length} part(s).`);
}

main()
  .catch((err: unknown) => {
    console.error('\n embed-parts crashed:\n', err);
    process.exitCode = 1;
  })
  .finally(disconnect);

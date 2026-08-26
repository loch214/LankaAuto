/**
 * Re-embeds one part immediately — the single-part equivalent of
 * `scripts/embed-parts.ts`, reused by both the ingestion approve-row
 * endpoint and `PATCH /parts/:id`, so a part is searchable right after it's
 * created or edited rather than waiting on the next `npm run embed:parts`.
 */
import { prisma } from '../../lib/prisma.js';
import { buildEmbeddingText, parseEmbeddingAttributes } from '../../ingest/build-embedding-text.js';
import { embedTexts } from '../embeddings.js';
import { upsertPartEmbedding } from '../part-embeddings.js';

export async function reembedPart(partId: string): Promise<void> {
  const part = await prisma.part.findUnique({
    where: { id: partId },
    include: {
      brand: true,
      category: true,
      fitments: { include: { vehicle: true } },
    },
  });
  if (part === null) return;

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

  const [vector] = await embedTexts([text], 'RETRIEVAL_DOCUMENT');
  if (vector === undefined) {
    throw new Error('reembedPart: embedTexts returned no vector');
  }
  await upsertPartEmbedding(part.id, vector, text);
}

/**
 * Ingests the GMB U-Joint price list into Postgres.
 *
 * Source rows come from `GMB_UJOINT_ROWS`, a hand-transcribed fixture of the
 * 62 rows in `GMB U JOINT-5.pdf` (profiled in
 * `backend/docs/01-source-profile-gmb-ujoint.md`). There is no general
 * CSV/PDF loader yet — that is real future work, not skipped by accident.
 * This script exists to prove the pipeline pieces built so far
 * (`normalizeCode`, `parseFitment`, `buildSourceKey`) actually produce a
 * correct, idempotent database, not just pass unit tests against fixtures.
 *
 * Idempotency, the Milestone 1B checkpoint: run this twice, `parts` count
 * does not change. `Category`/`Brand`/`Vehicle`/`Part`/`PartFitment` are all
 * upserted on their natural keys. `IngestionRun`/`StagingRow` are NOT
 * upserted — each run is its own audit record by design (see the schema
 * comment on `IngestionRun`), so running twice produces two runs and 124
 * staging rows, but still exactly 62 parts.
 */
import { prisma, disconnect } from '../lib/prisma.js';
import { parseFitment, type FitmentSpan } from '../ingest/parse-fitment.js';
import { normalizeCode } from '../ingest/normalize-code.js';
import { normalizeName } from '../ingest/normalize-name.js';
import { buildSourceKey } from '../ingest/build-source-key.js';
import { GMB_UJOINT_ROWS, type GmbRow } from '../ingest/__fixtures__/gmb-ujoint-rows.js';

const SOURCE_FILE = 'GMB U JOINT-5.pdf (GMB-U/JOINT-JAPAN, price list dated 2024-07-26)';
const BRAND_NAME = 'GMB';

function spansByType(spans: readonly FitmentSpan[], type: FitmentSpan['type']): string[] {
  return spans.filter((s) => s.type === type).map((s) => s.canonical);
}

/** Product type is row-derivable, not file-level — docs §3: 3/62 rows here are steering joints, not U-joints. */
function categoryFor(spans: readonly FitmentSpan[]): { name: string; slug: string } {
  const isSteeringJoint = spans.some(
    (s) => s.type === 'product_type' && s.canonical === 'STEERING JOINT',
  );
  return isSteeringJoint
    ? { name: 'Steering Joints', slug: 'steering-joints' }
    : { name: 'U-Joints', slug: 'u-joints' };
}

function buildAttributes(row: GmbRow, spans: readonly FitmentSpan[]) {
  return {
    make: row.make,
    model: spansByType(spans, 'model'),
    chassisCode: spansByType(spans, 'chassis'),
    engine: spansByType(spans, 'engine'),
    body: spansByType(spans, 'body'),
    inlineMake: spansByType(spans, 'make'),
    fuel: spansByType(spans, 'fuel'),
  };
}

async function ingestRow(
  row: GmbRow,
  rowNumber: number,
  runId: string,
  categoryIds: Map<string, string>,
  brandId: string,
) {
  const spans = parseFitment(row.fitment);
  const category = categoryFor(spans);
  const categoryId = categoryIds.get(category.slug);
  if (categoryId === undefined) {
    throw new Error(`category ${category.slug} was not pre-seeded`);
  }

  const rawName = `${row.make ?? ''} ${row.fitment}`.trim();
  const normalizedName = normalizeName(rawName);
  const unknownCount = spans.filter((s) => s.type === 'unknown').length;
  const parseConfidence = spans.length === 0 ? 0 : (spans.length - unknownCount) / spans.length;
  const needsReview = unknownCount > 0;
  const sourceKey = buildSourceKey(BRAND_NAME, row.code);
  const attributes = buildAttributes(row, spans);

  const part = await prisma.part.upsert({
    where: { sourceKey },
    create: {
      categoryId,
      brandId,
      rawName,
      normalizedName,
      partNumber: normalizeCode(row.code),
      attributes,
      parseConfidence,
      parseSource: 'LEXICON',
      needsReview,
      sourceKey,
    },
    update: {
      categoryId,
      brandId,
      rawName,
      normalizedName,
      partNumber: normalizeCode(row.code),
      attributes,
      parseConfidence,
      parseSource: 'LEXICON',
      needsReview,
    },
  });

  await prisma.stagingRow.create({
    data: {
      runId,
      rowNumber,
      raw: { ...row },
      rawName,
      normalizedName,
      parsedAttributes: attributes,
      parseSource: 'LEXICON',
      parseConfidence,
      partId: part.id,
      processedAt: new Date(),
    },
  });

  // Derive vehicles + fitments only where the row asserts them. A row like
  // GUT 17 ("CAB") has a make but no model span — no vehicle is fabricated.
  const modelSpans = spans.filter((s) => s.type === 'model');
  if (row.make !== null) {
    for (const modelSpan of modelSpans) {
      const identityKey = `${row.make}|${modelSpan.canonical}`.toUpperCase();
      const vehicle = await prisma.vehicle.upsert({
        where: { identityKey },
        create: { make: row.make, model: modelSpan.canonical, identityKey },
        update: {},
      });
      await prisma.partFitment.upsert({
        where: { partId_vehicleId: { partId: part.id, vehicleId: vehicle.id } },
        create: { partId: part.id, vehicleId: vehicle.id },
        update: {},
      });
    }
  }

  return { needsReview };
}

async function main() {
  const [uJoints, steeringJoints] = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'u-joints' },
      create: { name: 'U-Joints', slug: 'u-joints' },
      update: {},
    }),
    prisma.category.upsert({
      where: { slug: 'steering-joints' },
      create: { name: 'Steering Joints', slug: 'steering-joints' },
      update: {},
    }),
  ]);
  const categoryIds = new Map([
    ['u-joints', uJoints.id],
    ['steering-joints', steeringJoints.id],
  ]);

  const brand = await prisma.brand.upsert({
    where: { name: BRAND_NAME },
    create: { name: BRAND_NAME, normalizedName: BRAND_NAME, country: 'Japan' },
    update: {},
  });

  const run = await prisma.ingestionRun.create({
    data: { sourceFile: SOURCE_FILE, rowsTotal: GMB_UJOINT_ROWS.length },
  });

  let flagged = 0;
  for (const [index, row] of GMB_UJOINT_ROWS.entries()) {
    const { needsReview } = await ingestRow(row, index + 1, run.id, categoryIds, brand.id);
    if (needsReview) flagged += 1;
  }

  await prisma.ingestionRun.update({
    where: { id: run.id },
    data: {
      status: 'COMPLETED',
      finishedAt: new Date(),
      rowsParsedByRule: GMB_UJOINT_ROWS.length - flagged,
      rowsFlagged: flagged,
    },
  });

  const partCount = await prisma.part.count();
  console.log(`Ingested ${GMB_UJOINT_ROWS.length} rows from ${SOURCE_FILE}`);
  console.log(`  parsed cleanly: ${GMB_UJOINT_ROWS.length - flagged}, flagged for review: ${flagged}`);
  console.log(`  parts in database: ${partCount}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
